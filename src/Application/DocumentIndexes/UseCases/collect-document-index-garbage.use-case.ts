import type { CollectIndexChunkGarbageUseCaseContract } from '../../Chunks/Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import type { CollectDocumentRelationGarbageUseCaseContract } from '../../DocumentRelations/Contracts/collect-document-relation-garbage.use-case.contract.ts'
import type {
  DocumentGarbageCollectionScopeDto,
  DocumentGarbageCollectionResultDto,
} from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { InspectMembershipRetentionUseCaseContract } from '../../Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import { ReadDocumentIndexAssembler } from '../Assemblers/read-document-index.assembler.ts'
import type { CollectDocumentIndexGarbageUseCaseContract } from '../Contracts/collect-document-index-garbage.use-case.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { CollectDocumentIndexGarbageDto } from '../DataTransferObjects/document-index-garbage.dto.ts'
import type { DocumentIndexRecordDto } from '../DataTransferObjects/document-index-record.dto.ts'
import type { ExpiredDocumentIndexFailureDto } from '../DataTransferObjects/expired-document-index-failure.dto.ts'

export class CollectDocumentIndexGarbageUseCase implements CollectDocumentIndexGarbageUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly membershipRetention: InspectMembershipRetentionUseCaseContract,
    private readonly relationGarbage: CollectDocumentRelationGarbageUseCaseContract,
    private readonly chunkGarbage: CollectIndexChunkGarbageUseCaseContract,
  ) {}

  async execute({ scope, plan }: CollectDocumentIndexGarbageDto): Promise<DocumentGarbageCollectionResultDto> {
    const changedDocumentIds = new Set<string>()
    const failedJobsDeleted = await plan.failedJobs.reduce(async (previous, candidate) => {
      const count = await previous

      return count + (await this.collectExpiredFailedJob(scope, candidate, changedDocumentIds))
    }, Promise.resolve(0))
    const indexesDeleted = await plan.indexes.reduce(async (previous, candidate) => {
      const count = await previous

      return count + (await this.collectUnreferencedIndex(scope, candidate, changedDocumentIds))
    }, Promise.resolve(0))

    return DocumentIndexGarbageAssembler.toDocumentGarbageCollectionResultDTO(
      failedJobsDeleted + indexesDeleted,
      changedDocumentIds,
    )
  }

  private async collectExpiredFailedJob(
    scope: DocumentGarbageCollectionScopeDto,
    candidate: ExpiredDocumentIndexFailureDto,
    changedDocumentIds: Set<string>,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return 0

    const failedJob = await this.documentIndexFailureArchive.lockExpiredFailure(
      DocumentIndexGarbageAssembler.toDocumentIndexFailureIdQueryObject(candidate.failedJobId),
    )

    if (!failedJob || failedJob.failedAt.getTime() > scope.retentionCutoff.getTime()) return 0

    if (failedJob.failedJobId !== candidate.failedJobId || failedJob.documentId !== candidate.documentId) return 0

    if (
      await this.documentIndexExecutionQueue.countFailureRetries(
        DocumentIndexGarbageAssembler.toDocumentIndexFailureIdQueryObject(failedJob.failedJobId),
      )
    )
      return 0

    await this.documentIndexFailureArchive.removeExpiredFailure(
      DocumentIndexGarbageAssembler.toDocumentIndexFailureIdQueryObject(failedJob.failedJobId),
    )
    changedDocumentIds.add(failedJob.documentId)

    return 1
  }

  private async collectUnreferencedIndex(
    scope: DocumentGarbageCollectionScopeDto,
    candidate: DocumentIndexRecordDto,
    changedDocumentIds: Set<string>,
  ): Promise<number> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return 0

    const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(candidate.id),
    )

    if (restoredDocumentIndexDTO === null) return 0

    if (
      !restoredDocumentIndexDTO.unreferencedSince ||
      restoredDocumentIndexDTO.unreferencedSince.epochMilliseconds > scope.retentionCutoff.getTime()
    )
      return 0

    const index = ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(restoredDocumentIndexDTO)

    if (index.id !== candidate.id || index.documentId !== candidate.documentId) return 0

    const membershipProtectsIndex = await this.membershipRetention.execute(
      DocumentIndexGarbageAssembler.toInspectMembershipRetentionDTO(index.id),
    )
    const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )
    const failedJobCount = await this.documentIndexFailureArchive.countIndexFailures(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )

    if (membershipProtectsIndex || jobCount > 0 || failedJobCount > 0) return 0

    const collectedRelations = await this.relationGarbage.execute(
      DocumentIndexGarbageAssembler.toCollectDocumentRelationGarbageDTO(index, scope),
    )

    if (collectedRelations === null) return 0

    await this.chunkGarbage.execute(DocumentIndexGarbageAssembler.toIndexChunkGarbageDTO(index, scope))
    await this.documentIndexRepository.deleteByDocumentIndexId(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )
    changedDocumentIds.add(index.documentId)
    collectedRelations
      .flatMap((relation) => (relation.targetDocumentId === null ? [] : [relation.targetDocumentId]))
      .forEach((documentId) => changedDocumentIds.add(documentId))

    return 1
  }
}
