import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { StartDocumentIndexPruningRetentionUseCaseContract } from '../../DocumentIndexes/Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import type { LockDocumentRetentionParentsUseCaseContract } from '../../Documents/Contracts/lock-document-retention-parents.use-case.contract.ts'
import type { StartDocumentPruningRetentionUseCaseContract } from '../../Documents/Contracts/start-document-pruning-retention.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import type { ValidateKnowledgeBasePruningUseCaseContract } from '../../KnowledgeBases/Contracts/validate-knowledge-base-pruning.use-case.contract.ts'
import { PruningKnowledgeBaseDocumentAssembler } from '../Assemblers/pruning-knowledge-base-document.assembler.ts'
import type { KnowledgeBaseDocumentPruningEventDelivery } from '../Contracts/knowledge-base-document-pruning-event.delivery.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { PruneKnowledgeBaseDocumentsDTO } from '../DataTransferObjects/prune-knowledge-base-documents.dto.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

export class PruneKnowledgeBaseDocumentsUseCase {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly validatePruningScope: ValidateKnowledgeBasePruningUseCaseContract,
    private readonly lockDocumentParents: LockDocumentRetentionParentsUseCaseContract,
    private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
    private readonly knowledgeBaseDocumentPruningEventDelivery: KnowledgeBaseDocumentPruningEventDelivery,
    private readonly startIndexRetention: StartDocumentIndexPruningRetentionUseCaseContract,
    private readonly startDocumentRetention: StartDocumentPruningRetentionUseCaseContract,
  ) {}

  async execute(pruneKnowledgeBaseDocumentsDTO: PruneKnowledgeBaseDocumentsDTO): Promise<KnowledgeBaseDocument[]> {
    KnowledgeBaseDocumentInputGuard.assertObject(pruneKnowledgeBaseDocumentsDTO)

    if (
      typeof pruneKnowledgeBaseDocumentsDTO.projectId !== 'string' ||
      !pruneKnowledgeBaseDocumentsDTO.projectId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentInputException('projectId')

    if (
      typeof pruneKnowledgeBaseDocumentsDTO.knowledgeBaseId !== 'string' ||
      !pruneKnowledgeBaseDocumentsDTO.knowledgeBaseId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseId')

    if (
      !Array.isArray(pruneKnowledgeBaseDocumentsDTO.documentIds) ||
      Array.from(pruneKnowledgeBaseDocumentsDTO.documentIds).some(
        (documentId) => typeof documentId !== 'string' || !documentId.trim(),
      )
    )
      throw new InvalidKnowledgeBaseDocumentInputException('documentIds')

    const now = new Date()

    return this.persistenceTransaction.run(async () => {
      if (
        !(await this.validatePruningScope.execute(
          PruningKnowledgeBaseDocumentAssembler.toKnowledgeBasePruningScopeDTO(pruneKnowledgeBaseDocumentsDTO),
        ))
      )
        return []

      const retainedDocumentIds = new Set(pruneKnowledgeBaseDocumentsDTO.documentIds)
      const candidates = (
        await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdOrderByDocumentIdAsc(
          PruningKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentKnowledgeBaseQO(pruneKnowledgeBaseDocumentsDTO),
        )
      )
        .filter((candidate) => !retainedDocumentIds.has(candidate.documentId))
        .sort((left, right) => left.documentId.localeCompare(right.documentId))
      // Acquire all document parents before knowledgeBaseDocument, job, and index children.
      const lockedDocuments = await this.lockDocumentParents.execute(
        PruningKnowledgeBaseDocumentAssembler.toLockDocumentRetentionParentsDTO(candidates),
      )
      const lockedDocumentIds = lockedDocuments.map((document) => document.id)
      const pruneCandidateKnowledgeBaseDocument = (
        candidate: KnowledgeBaseDocument,
      ): Promise<KnowledgeBaseDocument | null> => this.pruneKnowledgeBaseDocument(candidate, now, lockedDocumentIds)
      const isPrunedKnowledgeBaseDocument = (
        knowledgeBaseDocument: KnowledgeBaseDocument | null,
      ): knowledgeBaseDocument is KnowledgeBaseDocument => knowledgeBaseDocument !== null

      // Parent locks precede sorted child locks; finish each child flow before acquiring the next child lock.
      return firstValueFrom(
        from(candidates).pipe(
          concatMap(pruneCandidateKnowledgeBaseDocument),
          filter(isPrunedKnowledgeBaseDocument),
          toArray(),
        ),
      )
    })
  }

  private async pruneKnowledgeBaseDocument(
    candidate: KnowledgeBaseDocument,
    now: Date,
    lockedDocumentIds: readonly string[],
  ): Promise<KnowledgeBaseDocument | null> {
    const knowledgeBaseDocument = await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId(
      PruningKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentSourceQO(candidate),
    )

    if (knowledgeBaseDocument === null) return null

    const detachedIndexIds = new Set(
      await this.knowledgeBaseDocumentPruningEventDelivery.deliver(
        PruningKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentPruningStartedEvent(candidate),
      ),
    )

    if (knowledgeBaseDocument.activeDocumentIndexId !== null)
      detachedIndexIds.add(knowledgeBaseDocument.activeDocumentIndexId)

    await this.knowledgeBaseDocumentRepository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
      PruningKnowledgeBaseDocumentAssembler.toUpdateDetachedKnowledgeBaseDocumentQO(
        knowledgeBaseDocument.detachIndex(now),
      ),
    )
    await this.knowledgeBaseDocumentRepository.removeByKnowledgeBaseIdAndDocumentId(
      PruningKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentSourceQO(candidate),
    )
    await this.startIndexRetention.execute(
      PruningKnowledgeBaseDocumentAssembler.toStartDocumentIndexPruningRetentionDTO(detachedIndexIds, now),
    )
    await this.startDocumentRetention.execute(
      PruningKnowledgeBaseDocumentAssembler.toStartDocumentPruningRetentionDTO(candidate, now, lockedDocumentIds),
    )

    return knowledgeBaseDocument
  }
}
