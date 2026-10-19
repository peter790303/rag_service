import { concatMap, from, lastValueFrom, toArray } from 'rxjs'

import type { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'
import { PruningDocumentIndexAssembler } from '../Assemblers/pruning-document-index.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { StartDocumentIndexPruningRetentionUseCaseContract } from '../Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import type { StartDocumentIndexPruningRetentionDTO } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class StartDocumentIndexPruningRetentionUseCase implements StartDocumentIndexPruningRetentionUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
  ) {}

  async execute({ documentIndexIds, now }: StartDocumentIndexPruningRetentionDTO): Promise<void> {
    const startRetention = async (documentIndexId: string): Promise<void> => {
      const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId(
        PruningDocumentIndexAssembler.toDocumentIndexIdQueryObject(documentIndexId),
      )

      if (restoredDocumentIndexDTO === null) return

      const knowledgeBaseDocumentProtectsIndex = await this.knowledgeBaseDocumentRetention.execute(
        PruningDocumentIndexAssembler.toInspectKnowledgeBaseDocumentRetentionDTO(documentIndexId),
      )
      const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
        PruningDocumentIndexAssembler.toDocumentIndexIdQueryObject(documentIndexId),
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
