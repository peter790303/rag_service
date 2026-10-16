import type { KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { CollectDocumentIndexGarbageUseCaseContract } from '../../DocumentIndexes/Contracts/collect-document-index-garbage.use-case.contract.ts'
import type { PlanDocumentIndexGarbageUseCaseContract } from '../../DocumentIndexes/Contracts/plan-document-index-garbage.use-case.contract.ts'
import type { PlanDocumentRelationGarbageUseCaseContract } from '../../DocumentRelations/Contracts/plan-document-relation-garbage.use-case.contract.ts'
import type { CollectDocumentRevisionGarbageUseCaseContract } from '../../DocumentRevisions/Contracts/collect-document-revision-garbage.use-case.contract.ts'
import type { PlanDocumentRevisionGarbageUseCaseContract } from '../../DocumentRevisions/Contracts/plan-document-revision-garbage.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { GarbageCollectionDocumentAssembler } from '../Assemblers/garbage-collection-document.assembler.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { DocumentGarbageCollectionScopeDto } from '../DataTransferObjects/document-garbage-collection-scope.dto.ts'
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
  ) {}

  async handle(event: DocumentGarbageCollectionRequestedEvent): Promise<void> {
    const now = new Date(event.requestedAt)
    const retentionCutoff = new Date(now.getTime() - this.serviceConfig.gcRetentionMs)

    return this.persistenceTransaction.run(async () => {
      const documentIndexGarbagePlanDTO = await this.planIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentIndexGarbageDTO(retentionCutoff),
      )
      const documentRevisionCandidatesDTO = await this.planRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRevisionGarbageDTO(retentionCutoff),
      )
      const expiredDocuments = await this.documentRepository.findByUnreferencedSinceLessThanOrEqual(
        GarbageCollectionDocumentAssembler.toDocumentGarbageCandidatesQO(retentionCutoff),
      )
      const relationCandidates = await this.planRelationGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRelationGarbageDTO(documentIndexGarbagePlanDTO.indexes),
      )
      const candidateDocumentIds = [
        ...new Set([
          ...documentIndexGarbagePlanDTO.failedJobs.map((candidate) => candidate.documentId),
          ...documentIndexGarbagePlanDTO.indexes.map((candidate) => candidate.documentId),
          ...documentRevisionCandidatesDTO.map((candidate) => candidate.documentId),
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
      const collectedDocumentIndexesDTO = await this.collectIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentIndexGarbageDTO(
          documentGarbageCollectionScopeDTO,
          documentIndexGarbagePlanDTO,
        ),
      )
      const collectedDocumentRevisionsDTO = await this.collectRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentRevisionGarbageDTO(
          documentGarbageCollectionScopeDTO,
          documentRevisionCandidatesDTO,
        ),
      )
      const changedDocumentIds = new Set([
        ...collectedDocumentIndexesDTO.changedDocumentIds,
        ...collectedDocumentRevisionsDTO.map((revision) => revision.documentId),
      ])

      await [...changedDocumentIds].sort().reduce(async (previous, documentId) => {
        await previous
        await this.startDocumentRetention(documentGarbageCollectionScopeDTO, now, documentId)
      }, Promise.resolve())

      await expiredDocuments
        .sort((left, right) => left.id.localeCompare(right.id))
        .reduce(async (previous, candidate) => {
          await previous
          await this.collectExpiredDocument(documentGarbageCollectionScopeDTO, candidate)
        }, Promise.resolve())
    })
  }

  private async startDocumentRetention(
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
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
    documentGarbageCollectionScopeDTO: DocumentGarbageCollectionScopeDto,
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
