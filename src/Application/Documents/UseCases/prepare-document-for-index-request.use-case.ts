import { randomUUID } from 'node:crypto'

import { Document } from '../../../Domain/Document/document.ts'
import { IndexingDocumentAssembler } from '../Assemblers/indexing-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { PrepareDocumentForIndexRequestUseCaseContract } from '../Contracts/prepare-document-for-index-request.use-case.contract.ts'
import type { SourceDocumentDto } from '../DataTransferObjects/source-document.dto.ts'
import { IndexRequestDocumentUnavailableException } from '../Exceptions/index-request-document-unavailable.exception.ts'
import { InvalidDocumentSourceInputException } from '../Exceptions/invalid-document-source-input.exception.ts'

/** Preserves a source document while its indexing request is prepared. */
export class PrepareDocumentForIndexRequestUseCase implements PrepareDocumentForIndexRequestUseCaseContract {
  constructor(private readonly documents: DocumentRepository) {}

  async execute(sourceDocument: SourceDocumentDto): Promise<Document> {
    if (sourceDocument === null || typeof sourceDocument !== 'object' || Array.isArray(sourceDocument)) {
      throw new InvalidDocumentSourceInputException('sourceDocument')
    }

    const candidate = new Document({
      id: randomUUID(),
      sourceType: sourceDocument.sourceType,
      sourceKey: sourceDocument.sourceKey,
      sourcePath: sourceDocument.sourcePath,
      currentTitle: sourceDocument.title === undefined ? null : sourceDocument.title,
      createdAt: new Date(),
      unreferencedSince: null,
    })
    const document = await this.upsertSource(candidate, sourceDocument.title !== undefined)
    const documentIdQO = { documentId: document.id }

    const lockedDocument = await this.documents.lockByDocumentId(documentIdQO)

    if (lockedDocument === null) {
      throw new IndexRequestDocumentUnavailableException()
    }

    return lockedDocument
  }

  private async upsertSource(document: Document, replaceTitle: boolean): Promise<Document> {
    if (!replaceTitle) {
      const upsertDocumentSourceQO = IndexingDocumentAssembler.toUpsertDocumentSourceQO(document)

      return this.documents.upsertBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceQO)
    }

    const upsertDocumentSourceTitleQO = IndexingDocumentAssembler.toUpsertDocumentSourceTitleQO(document)

    return this.documents.upsertTitleBySourceTypeAndSourceKeyAndSourcePath(upsertDocumentSourceTitleQO)
  }
}
