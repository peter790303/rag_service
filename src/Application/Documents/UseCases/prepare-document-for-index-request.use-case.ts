import { randomUUID } from 'node:crypto'

import { Document } from '../../../Domain/Document/document.ts'
import { IndexingDocumentAssembler } from '../Assemblers/indexing-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { PrepareDocumentForIndexRequestUseCaseContract } from '../Contracts/prepare-document-for-index-request.use-case.contract.ts'
import type { SourceDocumentDTO } from '../DataTransferObjects/source-document.dto.ts'
import { IndexRequestDocumentUnavailableException } from '../Exceptions/index-request-document-unavailable.exception.ts'

/** Preserves a source document while its indexing request is prepared. */
export class PrepareDocumentForIndexRequestUseCase implements PrepareDocumentForIndexRequestUseCaseContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(sourceDocument: SourceDocumentDTO): Promise<Document> {
    const sourceInput = IndexingDocumentAssembler.toDocumentSourceInput(sourceDocument)

    const candidate = new Document({
      id: randomUUID(),
      sourceType: sourceInput.sourceType,
      sourceKey: sourceInput.sourceKey,
      sourcePath: sourceInput.sourcePath,
      currentTitle: sourceInput.title === undefined ? null : sourceInput.title,
      createdAt: new Date(),
      unreferencedSince: null,
    })
    await this.upsertSource(candidate, sourceInput.title !== undefined)

    const documentSourceQO = IndexingDocumentAssembler.toDocumentSourceQO(candidate)
    const document = await this.documents.findBySourceTypeAndSourceKeyAndSourcePath(documentSourceQO)

    if (document === null) {
      throw new IndexRequestDocumentUnavailableException()
    }

    const documentIdQO = { documentId: document.id }

    const lockedDocument = await this.documents.lockByDocumentId(documentIdQO)

    if (lockedDocument === null) {
      throw new IndexRequestDocumentUnavailableException()
    }

    return lockedDocument
  }

  private async upsertSource(document: Document, replaceTitle: boolean): Promise<void> {
    if (!replaceTitle) {
      const upsertDocumentSourceQO = IndexingDocumentAssembler.toUpsertDocumentSourceQO(document)

      return this.documents.upsertBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceQO)
    }

    const upsertDocumentSourceTitleQO = IndexingDocumentAssembler.toUpsertDocumentSourceTitleQO(document)

    return this.documents.upsertTitleBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceTitleQO)
  }
}
