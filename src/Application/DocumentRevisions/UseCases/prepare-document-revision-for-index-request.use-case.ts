import { randomUUID } from 'node:crypto'

import { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import { InvalidDocumentRevisionContentException } from '../../../Domain/DocumentRevision/Exceptions/invalid-document-revision-content.exception.ts'
import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'
import { IndexingDocumentRevisionAssembler } from '../Assemblers/indexing-document-revision.assembler.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'

/** Reuses the content-addressed revision before allocating a new indexing target. */
export class PrepareDocumentRevisionForIndexRequestUseCase implements PrepareDocumentRevisionForIndexRequestUseCaseContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(prepareDocumentRevisionForIndexRequestDTO: {
    sourceDocument: SourceDocumentDto
    documentId: string
    contentSha256: string
  }): Promise<DocumentRevision> {
    if (!prepareDocumentRevisionForIndexRequestDTO?.sourceDocument) throw new InvalidDocumentRevisionContentException()

    const { sourceDocument, documentId, contentSha256 } = prepareDocumentRevisionForIndexRequestDTO
    const capturedAt = new Date()
    const capturedRevision = new DocumentRevision({
      id: randomUUID(),
      documentId,
      contentSha256,
      title: sourceDocument.title === undefined ? null : sourceDocument.title,
      content: sourceDocument.content,
      capturedAt,
      createdAt: capturedAt,
    })
    const documentRevisionContentQO = {
      documentId: capturedRevision.documentId,
      contentSha256: capturedRevision.contentSha256,
    }
    let revision = await this.revisions.findByDocumentIdAndContentSha256(documentRevisionContentQO)

    if (revision === null) {
      const createDocumentRevisionQO =
        IndexingDocumentRevisionAssembler.toCreateDocumentRevisionQueryObject(capturedRevision)
      revision = await this.revisions.create(createDocumentRevisionQO)
    }

    return revision
  }
}
