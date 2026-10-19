import { concatMap, firstValueFrom, from, toArray } from 'rxjs'

import type { KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { CollectDocumentIndexGarbageUseCaseContract } from '../../DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import type { DocumentIndexExecutionQueue } from '../../DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../DocumentIndexes/Contracts/document-index-failure.archive.ts'
import type { PlanDocumentIndexGarbageUseCaseContract } from '../../DocumentIndexes/Contracts/plan-document-index-garbage.use-case.contract.ts'
import type { ExpiredDocumentIndexFailureDTO } from '../../DocumentIndexes/DataTransferObjects/expired-document-index-failure.dto.ts'
import type { PlanDocumentRelationGarbageUseCaseContract } from '../../DocumentRelations/Contracts/plan-document-relation-garbage.use-case.contract.ts'
import type { CollectDocumentRevisionGarbageUseCaseContract } from '../../DocumentRevisions/Contracts/collect-document-revision-garbage.use-case.contract.ts'
import type { PlanDocumentRevisionGarbageUseCaseContract } from '../../DocumentRevisions/Contracts/plan-document-revision-garbage.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { GarbageCollectionDocumentAssembler } from '../Assemblers/garbage-collection-document.assembler.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { DocumentGarbageCollectionRequestedEvent } from '../Events/document-garbage-collection-requested.event.ts'
import type { InspectDocumentRetentionUseCase } from '../UseCases/inspect-document-retention.use-case.ts'
import type { LockDocumentRetentionParentsUseCase } from '../UseCases/lock-document-retention-parents.use-case.ts'

export class DocumentGarbageCollectionRequestedListener {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly documentRepository: DocumentRepository,
    private readonly planIndexGarbage: PlanDocumentIndexGarbageUseCaseContract,
    private readonly collectIndexGarbage: CollectDocumentIndexGarbageUseCaseContract,
    private readonly planRevisionGarbage: PlanDocumentRevisionGarbageUseCaseContract,
    private readonly collectRevisionGarbage: CollectDocumentRevisionGarbageUseCaseContract,
    private readonly planRelationGarbage: PlanDocumentRelationGarbageUseCaseContract,
    private readonly lockDocumentParents: LockDocumentRetentionParentsUseCase,
    private readonly documentRetention: InspectDocumentRetentionUseCase,
    private readonly serviceConfig: Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async handle(event: DocumentGarbageCollectionRequestedEvent): Promise<void> {
    const now = new Date(event.requestedAt)
    const retentionCutoff = new Date(now.getTime() - this.serviceConfig.gcRetentionMs)

    return this.persistenceTransaction.run(async () => {
      const failedJobCandidates = await this.documentIndexFailureArchive.findExpiredFailures(
        GarbageCollectionDocumentAssembler.toExpiredDocumentIndexFailuresQO(retentionCutoff),
      )
      const documentIndexCandidates = await this.planIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentIndexGarbageDTO(retentionCutoff),
      )
      const documentRevisionCandidates = await this.planRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRevisionGarbageDTO(retentionCutoff),
      )
      const expiredDocuments = await this.documentRepository.findByUnreferencedSinceLessThanOrEqual(
        GarbageCollectionDocumentAssembler.toDocumentGarbageCandidatesQO(retentionCutoff),
      )
      const relationCandidates = await this.planRelationGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRelationGarbageDTO(documentIndexCandidates),
      )
      const candidateDocumentIds = [
        ...new Set([
          ...failedJobCandidates.map((candidate) => candidate.documentId),
          ...documentIndexCandidates.map((candidate) => candidate.documentId),
          ...documentRevisionCandidates.map((candidate) => candidate.documentId),
          ...expiredDocuments.map((candidate) => candidate.id),
          ...relationCandidates.flatMap((relation) =>
            relation.targetDocumentId === null ? [] : [relation.targetDocumentId],
          ),
        ]),
      ].sort()

      // Lock every parent before any failed job, index or revision row.
      const lockedDocuments = await this.lockDocumentParents.execute(
        GarbageCollectionDocumentAssembler.toLockDocumentRetentionParentsDTO(candidateDocumentIds),
      )
      const documentGarbageCollectionScopeDTO = GarbageCollectionDocumentAssembler.toDocumentGarbageCollectionScopeDTO(
        retentionCutoff,
        lockedDocuments.map((document) => document.id),
      )
      const changedDocumentIds = new Set<string>()

      const sortedFailedJobCandidates = [...failedJobCandidates].sort((left, right) =>
        left.failedJobId.localeCompare(right.failedJobId),
      )
      const collectFailure = (candidate: ExpiredDocumentIndexFailureDTO): Promise<void> =>
        this.collectExpiredFailure(documentGarbageCollectionScopeDTO, candidate, changedDocumentIds)

      await firstValueFrom(from(sortedFailedJobCandidates).pipe(concatMap(collectFailure), toArray()))

      const collectedDocumentIndexes = await this.collectIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentIndexGarbageDTO(
          documentGarbageCollectionScopeDTO,
          documentIndexCandidates,
        ),
      )
      const collectedDocumentRevisions = await this.collectRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentRevisionGarbageDTO(
          documentGarbageCollectionScopeDTO,
          documentRevisionCandidates,
        ),
      )
      const collectedIndexIds = new Set(collectedDocumentIndexes.map((index) => index.id))

      collectedDocumentIndexes.forEach((index) => changedDocumentIds.add(index.documentId))
      collectedDocumentRevisions.forEach((revision) => changedDocumentIds.add(revision.documentId))
      relationCandidates
        .filter((relation) => collectedIndexIds.has(relation.sourceIndexId))
        .flatMap((relation) => (relation.targetDocumentId === null ? [] : [relation.targetDocumentId]))
        .forEach((documentId) => changedDocumentIds.add(documentId))

      const startRetention = (documentId: string): Promise<void> =>
        this.startDocumentRetention(documentGarbageCollectionScopeDTO, now, documentId)

      await firstValueFrom(from([...changedDocumentIds].sort()).pipe(concatMap(startRetention), toArray()))

      const sortedExpiredDocuments = [...expiredDocuments].sort((left, right) => left.id.localeCompare(right.id))
      const collectDocument = (candidate: Document): Promise<void> =>
        this.collectExpiredDocument(documentGarbageCollectionScopeDTO, candidate)

      await firstValueFrom(from(sortedExpiredDocuments).pipe(concatMap(collectDocument), toArray()))
    })
  }

  private async collectExpiredFailure(
    scope: DocumentGarbageCollectionScopeDTO,
    candidate: ExpiredDocumentIndexFailureDTO,
    changedDocumentIds: Set<string>,
  ): Promise<void> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return

    const failure = await this.documentIndexFailureArchive.lockExpiredFailure(
      GarbageCollectionDocumentAssembler.toDocumentIndexFailureIdQO(candidate.failedJobId),
    )

    if (!failure || failure.failedAt.getTime() > scope.retentionCutoff.getTime()) return

    if (failure.failedJobId !== candidate.failedJobId || failure.documentId !== candidate.documentId) return

    const retries = await this.documentIndexExecutionQueue.countFailureRetries(
      GarbageCollectionDocumentAssembler.toDocumentIndexFailureIdQO(failure.failedJobId),
    )

    if (retries > 0) return

    await this.documentIndexFailureArchive.removeExpiredFailure(
      GarbageCollectionDocumentAssembler.toDocumentIndexFailureIdQO(failure.failedJobId),
    )
    changedDocumentIds.add(failure.documentId)
  }

  private async startDocumentRetention(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    now: Date,
    documentId: string,
  ): Promise<void> {
    if (!documentGarbageCollectionScopeDTO.lockedDocumentIds.includes(documentId)) return

    const document = await this.documentRepository.lockByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(documentId),
    )

    if (!document || document.id !== documentId) return

    if (document.unreferencedSince) return

    if (await this.documentRetention.execute(RetentionDocumentAssembler.toInspectDocumentRetentionDTO(documentId)))
      return

    await this.documentRepository.updateUnreferencedSinceByDocumentIdAndUnreferencedSinceIsNull(
      RetentionDocumentAssembler.toMarkDocumentUnreferencedQO(document.id, document.startRetention(now)),
    )
  }

  private async collectExpiredDocument(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDTO,
    candidate: Document,
  ): Promise<void> {
    if (!documentGarbageCollectionScopeDTO.lockedDocumentIds.includes(candidate.id)) return

    const document = await this.documentRepository.lockByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(candidate.id),
    )

    if (!document) return

    if (!document.isRetentionExpired(documentGarbageCollectionScopeDTO.retentionCutoff)) return

    if (
      document.id !== candidate.id ||
      (await this.documentRetention.execute(RetentionDocumentAssembler.toInspectDocumentRetentionDTO(document.id)))
    )
      return

    await this.documentRepository.deleteByDocumentId(RetentionDocumentAssembler.toDocumentIdQO(document.id))
  }
}
