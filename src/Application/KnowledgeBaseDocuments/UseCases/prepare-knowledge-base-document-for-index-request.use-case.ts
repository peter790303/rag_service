import { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import { IndexingKnowledgeBaseDocumentAssembler } from '../Assemblers/indexing-knowledge-base-document.assembler.ts'
import type { KnowledgeBaseDocumentRepository } from '../Contracts/knowledge-base-document.repository.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract } from '../Contracts/prepare-knowledge-base-document-for-index-request.use-case.contract.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestDTO } from '../DataTransferObjects/prepare-knowledge-base-document-for-index-request.dto.ts'
import { IndexRequestKnowledgeBaseDocumentUnavailableException } from '../Exceptions/index-request-knowledge-base-document-unavailable.exception.ts'
import { KnowledgeBaseDocumentInputGuard } from '../Guards/knowledge-base-document-input.guard.ts'

/** Creates and configures knowledgeBaseDocument under the request's existing source lock. */
export class PrepareKnowledgeBaseDocumentForIndexRequestUseCase implements PrepareKnowledgeBaseDocumentForIndexRequestUseCaseContract {
  constructor(private readonly knowledgeBaseDocumentRepository: KnowledgeBaseDocumentRepository) {}

  async execute(
    prepareKnowledgeBaseDocumentForIndexRequestDTO: PrepareKnowledgeBaseDocumentForIndexRequestDTO,
  ): Promise<KnowledgeBaseDocument> {
    KnowledgeBaseDocumentInputGuard.assertObject(prepareKnowledgeBaseDocumentForIndexRequestDTO)
    KnowledgeBaseDocumentInputGuard.assertObject(
      prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument,
      'sourceDocument',
    )
    KnowledgeBaseDocumentInputGuard.assertSource(
      prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument.knowledgeBaseId,
      prepareKnowledgeBaseDocumentForIndexRequestDTO.documentId,
    )
    KnowledgeBaseDocumentInputGuard.assertConfiguration(
      prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument.isEntry,
      prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument.alwaysIncludeFullContent,
    )

    const knowledgeBaseDocumentSourceQO = {
      knowledgeBaseId: prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument.knowledgeBaseId,
      documentId: prepareKnowledgeBaseDocumentForIndexRequestDTO.documentId,
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

    const sourceDocumentDTO = prepareKnowledgeBaseDocumentForIndexRequestDTO.sourceDocument

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
