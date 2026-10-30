import { randomUUID } from 'node:crypto'

import type { PrepareDocumentRevisionForIndexRequestCommand } from './prepare-document-revision-for-index-request.command.ts'
import { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import { IndexingDocumentRevisionAssembler } from '../Assemblers/indexing-document-revision.assembler.ts'
import type { PrepareDocumentRevisionForIndexRequestCommandHandlerContract } from '../Contracts/prepare-document-revision-for-index-request.command.handler.contract.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

/** Reuses the content-addressed revision before allocating a new indexing target. */
export class PrepareDocumentRevisionForIndexRequestCommandHandler implements PrepareDocumentRevisionForIndexRequestCommandHandlerContract {
  constructor(private readonly revisions: DocumentRevisionRepository) {}

  async execute(
    prepareDocumentRevisionForIndexRequestCommand: PrepareDocumentRevisionForIndexRequestCommand,
  ): Promise<DocumentRevision> {
    const { documentId, contentSha256, title, content } =
      IndexingDocumentRevisionAssembler.toDocumentRevisionIndexRequestInput(
        prepareDocumentRevisionForIndexRequestCommand,
      )
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
      const createDocumentRevisionQO = IndexingDocumentRevisionAssembler.toCreateDocumentRevisionQO(capturedRevision)
      await this.revisions.create(createDocumentRevisionQO)
      revision = capturedRevision
    }

    return revision
  }
}
