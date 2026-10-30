import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { CollectDocumentIndexGarbageCommand } from './collect-document-index-garbage.command.ts'
import type { CollectIndexChunkGarbageCommandHandlerContract } from '../../../Chunks/Application/Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import type { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../../Documents/Application/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import { ReadDocumentIndexAssembler } from '../Assemblers/read-document-index.assembler.ts'
import type { CollectDocumentIndexGarbageCommandHandlerContract } from '../Contracts/collect-document-index-garbage.command.handler.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

export class CollectDocumentIndexGarbageCommandHandler implements CollectDocumentIndexGarbageCommandHandlerContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
    private readonly relationGarbage: CollectDocumentRelationGarbageCommandHandlerContract,
    private readonly chunkGarbage: CollectIndexChunkGarbageCommandHandlerContract,
  ) {}

  async execute({ scope, candidates }: CollectDocumentIndexGarbageCommand): Promise<DocumentIndex[]> {
    const orderedCandidates = [...candidates].sort((left, right) => left.id.localeCompare(right.id))

    const collectCandidate = (candidate: DocumentIndex) => this.collectUnreferencedIndex(scope, candidate)
    const wasCollected = (index: DocumentIndex | null): index is DocumentIndex => index !== null

    return firstValueFrom(from(orderedCandidates).pipe(concatMap(collectCandidate), filter(wasCollected), toArray()))
  }

  private async collectUnreferencedIndex(
    scope: DocumentGarbageCollectionScopeDTO,
    candidate: DocumentIndex,
  ): Promise<DocumentIndex | null> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return null

    const index = await this.documentIndexRepository.lockByDocumentIndexId(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQO(candidate.id),
    )

    if (index === null) return null

    if (!index.unreferencedSince || index.unreferencedSince.epochMilliseconds > scope.retentionCutoff.getTime())
      return null

    if (index.id !== candidate.id || index.documentId !== candidate.documentId) return null

    const knowledgeBaseDocumentProtectsIndex = await this.knowledgeBaseDocumentRetention.execute(
      DocumentIndexGarbageAssembler.toInspectKnowledgeBaseDocumentRetentionQuery(index.id),
    )
    const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQO(index.id),
    )
    const failedJobCount = await this.documentIndexFailureArchive.countIndexFailures(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQO(index.id),
    )

    if (knowledgeBaseDocumentProtectsIndex || jobCount > 0 || failedJobCount > 0) return null

    const collectedRelations = await this.relationGarbage.execute(
      DocumentIndexGarbageAssembler.toCollectDocumentRelationGarbageCommand(index, scope),
    )

    if (collectedRelations === null) return null

    await this.chunkGarbage.execute(
      DocumentIndexGarbageAssembler.toCollectIndexChunkGarbageCommand(
        ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(index),
        scope,
      ),
    )
    await this.documentIndexRepository.deleteByDocumentIndexId(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQO(index.id),
    )

    return index
  }
}
