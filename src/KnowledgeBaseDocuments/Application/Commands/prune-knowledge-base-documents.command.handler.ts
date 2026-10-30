import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { PruneKnowledgeBaseDocumentsCommand } from './prune-knowledge-base-documents.command.ts'
import type { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import type { LockDocumentRetentionParentsCommandHandlerContract } from '../../../Documents/Application/Contracts/lock-document-retention-parents.command.handler.contract.ts'
import type { StartDocumentPruningRetentionCommandHandlerContract } from '../../../Documents/Application/Contracts/start-document-pruning-retention.command.handler.contract.ts'
import type { ValidateKnowledgeBasePruningCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/validate-knowledge-base-pruning.command.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { PruningKnowledgeBaseDocumentAssembler } from '../Assemblers/pruning-knowledge-base-document.assembler.ts'
import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentPruningEventDelivery } from '../Ports/Out/Gateways/knowledge-base-document-pruning-event.delivery.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

export class PruneKnowledgeBaseDocumentsCommandHandler {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly validatePruningScope: ValidateKnowledgeBasePruningCommandHandlerContract,
    private readonly lockDocumentParents: LockDocumentRetentionParentsCommandHandlerContract,
    private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository,
    private readonly knowledgeBaseDocumentPruningEventDelivery: KnowledgeBaseDocumentPruningEventDelivery,
    private readonly startIndexRetention: StartDocumentIndexPruningRetentionCommandHandlerContract,
    private readonly startDocumentRetention: StartDocumentPruningRetentionCommandHandlerContract,
  ) {}

  async execute(
    pruneKnowledgeBaseDocumentsCommand: PruneKnowledgeBaseDocumentsCommand,
  ): Promise<KnowledgeBaseDocument[]> {
    KnowledgeBaseDocumentInputGuard.assertObject(pruneKnowledgeBaseDocumentsCommand)

    if (
      typeof pruneKnowledgeBaseDocumentsCommand.projectId !== 'string' ||
      !pruneKnowledgeBaseDocumentsCommand.projectId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentInputException('projectId')

    if (
      typeof pruneKnowledgeBaseDocumentsCommand.knowledgeBaseId !== 'string' ||
      !pruneKnowledgeBaseDocumentsCommand.knowledgeBaseId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseId')

    if (
      !Array.isArray(pruneKnowledgeBaseDocumentsCommand.documentIds) ||
      Array.from(pruneKnowledgeBaseDocumentsCommand.documentIds).some(
        (documentId) => typeof documentId !== 'string' || !documentId.trim(),
      )
    )
      throw new InvalidKnowledgeBaseDocumentInputException('documentIds')

    const now = new Date()

    return this.persistenceTransaction.run(async () => {
      if (
        !(await this.validatePruningScope.execute(
          PruningKnowledgeBaseDocumentAssembler.toValidateKnowledgeBasePruningCommand(
            pruneKnowledgeBaseDocumentsCommand,
          ),
        ))
      )
        return []

      const retainedDocumentIds = new Set(pruneKnowledgeBaseDocumentsCommand.documentIds)
      const candidates = (
        await this.knowledgeBaseDocumentRepository.findByKnowledgeBaseIdOrderByDocumentIdAsc(
          PruningKnowledgeBaseDocumentAssembler.toKnowledgeBaseDocumentKnowledgeBaseQO(
            pruneKnowledgeBaseDocumentsCommand,
          ),
        )
      )
        .filter((candidate) => !retainedDocumentIds.has(candidate.documentId))
        .sort((left, right) => left.documentId.localeCompare(right.documentId))
      // Acquire all document parents before knowledgeBaseDocument, job, and index children.
      const lockedDocuments = await this.lockDocumentParents.execute(
        PruningKnowledgeBaseDocumentAssembler.toLockDocumentRetentionParentsCommand(candidates),
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
      PruningKnowledgeBaseDocumentAssembler.toStartDocumentIndexPruningRetentionCommand(detachedIndexIds, now),
    )
    await this.startDocumentRetention.execute(
      PruningKnowledgeBaseDocumentAssembler.toStartDocumentPruningRetentionCommand(candidate, now, lockedDocumentIds),
    )

    return knowledgeBaseDocument
  }
}
