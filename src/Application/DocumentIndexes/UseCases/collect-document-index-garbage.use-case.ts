import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { CollectIndexChunkGarbageUseCaseContract } from '../../Chunks/Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import type { CollectDocumentRelationGarbageUseCaseContract } from '../../DocumentRelations/Contracts/collect-document-relation-garbage.use-case.contract.ts'
import type { DocumentGarbageCollectionScopeDTO } from '../../Documents/DataTransferObjects/document-garbage-collection-scope.dto.ts'
import type { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'
import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import { ReadDocumentIndexAssembler } from '../Assemblers/read-document-index.assembler.ts'
import type { CollectDocumentIndexGarbageUseCaseContract } from '../Contracts/collect-document-index-garbage.use-case.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { CollectDocumentIndexGarbageDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class CollectDocumentIndexGarbageUseCase implements CollectDocumentIndexGarbageUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
    private readonly relationGarbage: CollectDocumentRelationGarbageUseCaseContract,
    private readonly chunkGarbage: CollectIndexChunkGarbageUseCaseContract,
  ) {}

  async execute({ scope, candidates }: CollectDocumentIndexGarbageDTO): Promise<DocumentIndex[]> {
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
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(candidate.id),
    )

    if (index === null) return null

    if (!index.unreferencedSince || index.unreferencedSince.epochMilliseconds > scope.retentionCutoff.getTime())
      return null

    if (index.id !== candidate.id || index.documentId !== candidate.documentId) return null

    const knowledgeBaseDocumentProtectsIndex = await this.knowledgeBaseDocumentRetention.execute(
      DocumentIndexGarbageAssembler.toInspectKnowledgeBaseDocumentRetentionDTO(index.id),
    )
    const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )
    const failedJobCount = await this.documentIndexFailureArchive.countIndexFailures(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )

    if (knowledgeBaseDocumentProtectsIndex || jobCount > 0 || failedJobCount > 0) return null

    const collectedRelations = await this.relationGarbage.execute(
      DocumentIndexGarbageAssembler.toCollectDocumentRelationGarbageDTO(index, scope),
    )

    if (collectedRelations === null) return null

    await this.chunkGarbage.execute(
      DocumentIndexGarbageAssembler.toIndexChunkGarbageDTO(
        ReadDocumentIndexAssembler.toDocumentIndexRecordDTO(index),
        scope,
      ),
    )
    await this.documentIndexRepository.deleteByDocumentIndexId(
      DocumentIndexGarbageAssembler.toDocumentIndexIdQueryObject(index.id),
    )

    return index
  }
}
