import type { PrepareKnowledgeBaseDocumentForIndexRequestCommand } from './prepare-knowledge-base-document-for-index-request.command.ts'
import { KnowledgeBaseDocument } from '../../Domain/Entities/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract } from '../Contracts/prepare-knowledge-base-document-for-index-request.command.handler.contract.ts'
import { IndexRequestKnowledgeBaseDocumentUnavailableException } from '../Exceptions/index-request-knowledge-base-document-unavailable.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'
import type { KnowledgeBaseDocumentRepository } from '../Ports/Out/Repositories/knowledge-base-document.repository.ts'

/** Creates and configures knowledgeBaseDocument under the request's existing source lock. */
export class PrepareKnowledgeBaseDocumentForIndexRequestCommandHandler implements PrepareKnowledgeBaseDocumentForIndexRequestCommandHandlerContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    prepareKnowledgeBaseDocumentForIndexRequestCommand: PrepareKnowledgeBaseDocumentForIndexRequestCommand,
  ): Promise<KnowledgeBaseDocument> {
    KnowledgeBaseDocumentInputGuard.assertObject(prepareKnowledgeBaseDocumentForIndexRequestCommand)
    KnowledgeBaseDocumentInputGuard.assertObject(
      prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument,
      'sourceDocument',
    )
    KnowledgeBaseDocumentInputGuard.assertSource(
      prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument.knowledgeBaseId,
      prepareKnowledgeBaseDocumentForIndexRequestCommand.documentId,
    )
    KnowledgeBaseDocumentInputGuard.assertConfiguration(
      prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument.isEntry,
      prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument.alwaysIncludeFullContent,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument.knowledgeBaseId,
      documentId: prepareKnowledgeBaseDocumentForIndexRequestCommand.documentId,
    }
    let knowledgeBaseDocument =
      await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)

    if (knowledgeBaseDocument === null) {
      const newKnowledgeBaseDocument = new KnowledgeBaseDocument({
        knowledgeBaseId: knowledgeBaseDocumentSourceQO.knowledgeBaseId,
        documentId: knowledgeBaseDocumentSourceQO.documentId,
        requestedGeneration: '0',
        activeDocumentIndexId: null,
        isEntry: false,
        alwaysIncludeFullContent: false,
        updatedAt: new Date(),
      })
      const insertKnowledgeBaseDocumentQO =
        IndexingKnowledgeBaseDocumentAssembler.toInsertKnowledgeBaseDocumentQO(newKnowledgeBaseDocument)
      await this.knowledgeBaseDocumentRepository.insert(insertKnowledgeBaseDocumentQO)
      knowledgeBaseDocument =
        await this.knowledgeBaseDocumentRepository.lockByKnowledgeBaseIdAndDocumentId(knowledgeBaseDocumentSourceQO)
    }

    if (knowledgeBaseDocument === null) throw new IndexRequestKnowledgeBaseDocumentUnavailableException()

    const sourceDocumentDTO = prepareKnowledgeBaseDocumentForIndexRequestCommand.sourceDocument

    if (sourceDocumentDTO.isEntry === undefined && sourceDocumentDTO.alwaysIncludeFullContent === undefined)
      return knowledgeBaseDocument

    const configuredKnowledgeBaseDocument = knowledgeBaseDocument.configure(sourceDocumentDTO, new Date())
    const updateKnowledgeBaseDocumentQO = IndexingKnowledgeBaseDocumentAssembler.toUpdateKnowledgeBaseDocumentQO(
      configuredKnowledgeBaseDocument,
    )
    await this.knowledgeBaseDocumentRepository.updateByKnowledgeBaseIdAndDocumentId(updateKnowledgeBaseDocumentQO)

    return configuredKnowledgeBaseDocument
  }
}
