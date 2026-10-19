import { randomUUID } from 'node:crypto'

import { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import { IndexingDocumentRevisionAssembler } from '../Assemblers/indexing-document-revision.assembler.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type { PrepareDocumentRevisionForIndexRequestUseCaseContract } from '../Contracts/prepare-document-revision-for-index-request.use-case.contract.ts'
import type { PrepareDocumentRevisionForIndexRequestDTO } from '../DataTransferObjects/prepare-document-revision-for-index-request.dto.ts'

/** Reuses the content-addressed revision before allocating a new indexing target. */
export class PrepareDocumentRevisionForIndexRequestUseCase implements PrepareDocumentRevisionForIndexRequestUseCaseContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(
    prepareDocumentRevisionForIndexRequestDTO: PrepareDocumentRevisionForIndexRequestDTO,
  ): Promise<DocumentRevision> {
    const { documentId, contentSha256, title, content } =
      IndexingDocumentRevisionAssembler.toDocumentRevisionIndexRequestInput(prepareDocumentRevisionForIndexRequestDTO)
    const capturedAt = new Date()
    const capturedRevision = new DocumentRevision({
      id: randomUUID(),
      documentId,
      contentSha256,
      title,
      content,
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
      await this.revisions.create(createDocumentRevisionQO)
      revision = capturedRevision
    }

    return revision
  }
}
