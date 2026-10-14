import type { RagConfig } from '../../../../config/rag.config.js'
import type {
  GarbageCollectionTransaction,
  GarbageDocumentCandidate,
  GarbageFailedJobCandidate,
  GarbageIndexCandidate,
  GarbageRevisionCandidate,
} from '../Contracts/rag-retention-operations.js'
import type { RagGarbageCollectionStore } from '../Contracts/rag-retention-store.js'
import { hasDocumentReferences } from '../Helpers/document-retention.helper.js'

type GarbageCollectionScope = {
  transaction: GarbageCollectionTransaction
  retentionCutoff: Date
  now: Date
  lockedDocumentIds: ReadonlySet<string>
  changedDocumentIds: Set<string>
}

export class CollectRagGarbageUseCase {
  constructor(
    private readonly indexes: RagGarbageCollectionStore,
    private readonly config: Pick<RagConfig, 'gcRetentionMs'>,
  ) {}

  async execute(): Promise<number> {
    const now = new Date()
    const retentionCutoff = new Date(now.getTime() - this.config.gcRetentionMs)

    return this.indexes.withGarbageCollectionTransaction(async (transaction) => {
      const failedJobCandidates = (await transaction.findGarbageFailedJobCandidates(retentionCutoff)).sort(
        (left, right) => left.failedJobId.localeCompare(right.failedJobId),
      )
      const indexCandidates = (await transaction.findGarbageIndexCandidates(retentionCutoff)).sort((left, right) =>
        left.documentIndexId.localeCompare(right.documentIndexId),
      )
      const revisionCandidates = (await transaction.findGarbageRevisionCandidates(retentionCutoff)).sort(
        (left, right) => left.documentRevisionId.localeCompare(right.documentRevisionId),
      )
      const documentCandidates = await transaction.findGarbageDocumentCandidates(retentionCutoff)
      const relationTargets = await transaction.findIndexRelationTargets(
        indexCandidates.map((candidate) => candidate.documentIndexId),
      )
      const candidateDocumentIds = [
        ...new Set([
          ...failedJobCandidates.map((candidate) => candidate.documentId),
          ...indexCandidates.map((candidate) => candidate.documentId),
          ...revisionCandidates.map((candidate) => candidate.documentId),
          ...documentCandidates.map((candidate) => candidate.documentId),
          ...relationTargets.map((target) => target.documentId),
        ]),
      ].sort()
      const lockedDocumentIds = new Set<string>()
      const scope: GarbageCollectionScope = {
        transaction,
        retentionCutoff,
        now,
        lockedDocumentIds,
        changedDocumentIds: new Set<string>(),
      }

      // Lock all parents before their children; request, retry, prune and GC use this order.
      await candidateDocumentIds.reduce(async (previousLock, documentId) => {
        await previousLock
        await this.lockParentDocument(transaction, lockedDocumentIds, documentId)
      }, Promise.resolve())

      // Deletion order preserves foreign keys and keeps each reference check in this transaction.
      const deletedFailedJobs = await failedJobCandidates.reduce(async (previousCount, candidate) => {
        const deletedCount = await previousCount

        return deletedCount + (await this.collectExpiredFailedJob(scope, candidate))
      }, Promise.resolve(0))
      const deletedIndexes = await indexCandidates.reduce(async (previousCount, candidate) => {
        const deletedCount = await previousCount

        return deletedCount + (await this.collectUnreferencedIndex(scope, candidate))
      }, Promise.resolve(0))
      const deletedRevisions = await revisionCandidates.reduce(async (previousCount, candidate) => {
        const deletedCount = await previousCount

        return deletedCount + (await this.collectUnreferencedRevision(scope, candidate))
      }, Promise.resolve(0))

      await [...scope.changedDocumentIds].sort().reduce(async (previousRetention, documentId) => {
        await previousRetention
        await this.startDocumentRetention(scope, documentId)
      }, Promise.resolve())

      const deletedDocuments = await documentCandidates
        .sort((left, right) => left.documentId.localeCompare(right.documentId))
        .reduce(async (previousCount, candidate) => {
          const deletedCount = await previousCount

          return deletedCount + (await this.collectExpiredDocument(scope, candidate))
        }, Promise.resolve(0))

      return deletedFailedJobs + deletedIndexes + deletedRevisions + deletedDocuments
    })
  }

  private async lockParentDocument(
    transaction: GarbageCollectionTransaction,
    lockedDocumentIds: Set<string>,
    documentId: string,
  ): Promise<void> {
    if (await transaction.lockGarbageDocument(documentId)) lockedDocumentIds.add(documentId)
  }

  private async collectExpiredFailedJob(
    scope: GarbageCollectionScope,
    candidate: GarbageFailedJobCandidate,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.has(candidate.documentId)) return 0

    const failedJob = await scope.transaction.lockFailedJobForRetention(candidate.failedJobId)

    if (!failedJob || failedJob.failedAt.getTime() > scope.retentionCutoff.getTime()) return 0

    if (await scope.transaction.countRetriesForFailedJob(failedJob.failedJobId)) return 0

    await scope.transaction.removeFailedJob(failedJob.failedJobId)
    scope.changedDocumentIds.add(failedJob.documentId)

    return 1
  }

  private async collectUnreferencedIndex(
    scope: GarbageCollectionScope,
    candidate: GarbageIndexCandidate,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.has(candidate.documentId)) return 0

    const index = await scope.transaction.lockGarbageIndex(candidate.documentIndexId)

    if (!index?.unreferencedSince || index.unreferencedSince.getTime() > scope.retentionCutoff.getTime()) return 0

    const membershipCount = await scope.transaction.countMembershipsForIndex(index.documentIndexId)
    const jobCount = await scope.transaction.countJobsForIndex(index.documentIndexId)
    const failedJobCount = await scope.transaction.countFailedJobsForIndex(index.documentIndexId)

    if (membershipCount > 0 || jobCount > 0 || failedJobCount > 0) return 0

    const currentRelationTargets = await scope.transaction.findIndexRelationTargets([index.documentIndexId])

    // A concurrently changed relation target is collected next time to preserve parent lock order.
    if (currentRelationTargets.some((target) => !scope.lockedDocumentIds.has(target.documentId))) return 0

    await scope.transaction.removeRelationsForIndex(index.documentIndexId)
    await scope.transaction.removeChunksForIndex(index.documentIndexId)
    await scope.transaction.removeGarbageIndex(index.documentIndexId)
    scope.changedDocumentIds.add(index.documentId)
    currentRelationTargets.forEach((target) => scope.changedDocumentIds.add(target.documentId))

    return 1
  }

  private async collectUnreferencedRevision(
    scope: GarbageCollectionScope,
    candidate: GarbageRevisionCandidate,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.has(candidate.documentId)) return 0

    const revision = await scope.transaction.lockGarbageRevision(candidate.documentRevisionId)

    if (!revision || revision.createdAt.getTime() > scope.retentionCutoff.getTime()) return 0

    if (await scope.transaction.countIndexesForRevision(revision.documentRevisionId)) return 0

    await scope.transaction.removeGarbageRevision(revision.documentRevisionId)
    scope.changedDocumentIds.add(revision.documentId)

    return 1
  }

  private async startDocumentRetention(scope: GarbageCollectionScope, documentId: string): Promise<void> {
    const document = await scope.transaction.lockGarbageDocument(documentId)

    if (!document || document.unreferencedSince) return

    if (!(await hasDocumentReferences(scope.transaction, documentId))) {
      await scope.transaction.markDocumentUnreferenced(documentId, scope.now)
    }
  }

  private async collectExpiredDocument(
    scope: GarbageCollectionScope,
    candidate: GarbageDocumentCandidate,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.has(candidate.documentId)) return 0

    const document = await scope.transaction.lockGarbageDocument(candidate.documentId)

    if (!document?.unreferencedSince || document.unreferencedSince.getTime() > scope.retentionCutoff.getTime()) return 0

    if (await hasDocumentReferences(scope.transaction, document.documentId)) return 0

    await scope.transaction.removeGarbageDocument(document.documentId)

    return 1
  }
}
