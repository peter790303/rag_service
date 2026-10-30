import { concatMap, from, lastValueFrom, toArray } from 'rxjs'

import type { StartDocumentIndexPruningRetentionCommand } from './start-document-index-pruning-retention.command.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import { PruningDocumentIndexAssembler } from '../Assemblers/pruning-document-index.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { StartDocumentIndexPruningRetentionCommandHandlerContract } from '../Contracts/start-document-index-pruning-retention.command.handler.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

export class StartDocumentIndexPruningRetentionCommandHandler implements StartDocumentIndexPruningRetentionCommandHandlerContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
  ) {}

  async execute({ documentIndexIds, now }: StartDocumentIndexPruningRetentionCommand): Promise<void> {
    const startRetention = async (documentIndexId: string): Promise<void> => {
      const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId(
        PruningDocumentIndexAssembler.toDocumentIndexIdQO(documentIndexId),
      )

      if (restoredDocumentIndexDTO === null) return

      const knowledgeBaseDocumentProtectsIndex = await this.knowledgeBaseDocumentRetention.execute(
        PruningDocumentIndexAssembler.toInspectKnowledgeBaseDocumentRetentionQuery(documentIndexId),
      )
      const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
        PruningDocumentIndexAssembler.toDocumentIndexIdQO(documentIndexId),
      )

      if (knowledgeBaseDocumentProtectsIndex || jobCount > 0) return

      await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(
        WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(
          restoredDocumentIndexDTO.markUnreferenced(now),
        ),
      )
    }
    const orderedDocumentIndexIds = [...documentIndexIds].sort()

    await lastValueFrom(from(orderedDocumentIndexIds).pipe(concatMap(startRetention), toArray()))
  }
}
