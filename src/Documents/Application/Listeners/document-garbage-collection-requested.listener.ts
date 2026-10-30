import { concatMap, firstValueFrom, from, toArray } from 'rxjs'

import type { KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import type { CollectDocumentIndexFailureGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-failure-garbage.command.handler.contract.ts'
import type { CollectDocumentIndexGarbageCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/collect-document-index-garbage.command.handler.contract.ts'
import type { PlanDocumentIndexGarbageQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/plan-document-index-garbage.query.handler.contract.ts'
import type { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import type { CollectDocumentRevisionGarbageCommandHandlerContract } from '../../../DocumentRevisions/Application/Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import type { PlanDocumentRevisionGarbageQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/plan-document-revision-garbage.query.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { GarbageCollectionDocumentAssembler } from '../Assemblers/garbage-collection-document.assembler.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { LockDocumentRetentionParentsCommandHandler } from '../Commands/lock-document-retention-parents.command.handler.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../DTOs/document-garbage-collection-scope.dto.ts'
import type { DocumentGarbageCollectionRequestedEvent } from '../Events/document-garbage-collection-requested.event.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'
import type { InspectDocumentRetentionQueryHandler } from '../Queries/inspect-document-retention.query.handler.ts'

export class DocumentGarbageCollectionRequestedListener {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly documentRepository: DocumentRepository,
    private readonly planIndexGarbage: PlanDocumentIndexGarbageQueryHandlerContract,
    private readonly collectIndexGarbage: CollectDocumentIndexGarbageCommandHandlerContract,
    private readonly planRevisionGarbage: PlanDocumentRevisionGarbageQueryHandlerContract,
    private readonly collectRevisionGarbage: CollectDocumentRevisionGarbageCommandHandlerContract,
    private readonly planRelationGarbage: PlanDocumentRelationGarbageQueryHandlerContract,
    private readonly lockDocumentParents: LockDocumentRetentionParentsCommandHandler,
    private readonly documentRetention: InspectDocumentRetentionQueryHandler,
    private readonly serviceConfig: Pick<KnowledgeServiceConfig, 'gcRetentionMs'>,
    private readonly collectFailureGarbage: CollectDocumentIndexFailureGarbageCommandHandlerContract,
  ) {}

  async handle(event: DocumentGarbageCollectionRequestedEvent): Promise<void> {
    const now = new Date(event.requestedAt)
    const retentionCutoff = new Date(now.getTime() - this.serviceConfig.gcRetentionMs)

    return this.persistenceTransaction.run(async () => {
      const indexGarbagePlan = await this.planIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentIndexGarbageQuery(retentionCutoff),
      )
      const failedJobCandidates = indexGarbagePlan.failures
      const documentIndexCandidates = indexGarbagePlan.indexes
      const documentRevisionCandidates = await this.planRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRevisionGarbageQuery(retentionCutoff),
      )
      const expiredDocuments = await this.documentRepository.findByUnreferencedSinceLessThanOrEqual(
        GarbageCollectionDocumentAssembler.toDocumentGarbageCandidatesQO(retentionCutoff),
      )
      const relationCandidates = await this.planRelationGarbage.execute(
        GarbageCollectionDocumentAssembler.toPlanDocumentRelationGarbageQuery(documentIndexCandidates),
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
        GarbageCollectionDocumentAssembler.toLockDocumentRetentionParentsCommand(candidateDocumentIds),
      )
      const documentGarbageCollectionScopeDTO = GarbageCollectionDocumentAssembler.toDocumentGarbageCollectionScopeDTO(
        retentionCutoff,
        lockedDocuments.map((document) => document.id),
      )
      const changedDocumentIds = new Set<string>()

      const collectedFailures = await this.collectFailureGarbage.execute({
        scope: documentGarbageCollectionScopeDTO,
        candidates: failedJobCandidates,
      })
      collectedFailures.forEach((failure) => changedDocumentIds.add(failure.documentId))

      const collectedDocumentIndexes = await this.collectIndexGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentIndexGarbageCommand(
          documentGarbageCollectionScopeDTO,
          documentIndexCandidates,
        ),
      )
      const collectedDocumentRevisions = await this.collectRevisionGarbage.execute(
        GarbageCollectionDocumentAssembler.toCollectDocumentRevisionGarbageCommand(
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

    if (await this.documentRetention.execute(RetentionDocumentAssembler.toInspectDocumentRetentionQuery(documentId)))
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
      (await this.documentRetention.execute(RetentionDocumentAssembler.toInspectDocumentRetentionQuery(document.id)))
    )
      return

    await this.documentRepository.deleteByDocumentId(RetentionDocumentAssembler.toDocumentIdQO(document.id))
  }
}
