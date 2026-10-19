import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import { RetrievalDocumentRevisionsAssembler } from '../Assemblers/retrieval-document-revisions.assembler.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import { LoadRetrievalDocumentRevisionsUseCaseContract } from '../Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import type { LoadRetrievalDocumentRevisionsDTO } from '../DataTransferObjects/load-retrieval-document-revisions.dto.ts'

/** Publishes only the facts in this feature's requested retrieval scope. */
export class LoadRetrievalDocumentRevisionsUseCase extends LoadRetrievalDocumentRevisionsUseCaseContract {
  constructor(private readonly documentRevisionRepository: DocumentRevisionRepository) {
    super()
  }

  async execute(loadRetrievalDocumentRevisionsDTO: LoadRetrievalDocumentRevisionsDTO): Promise<DocumentRevision[]> {
    const { revisionIds } = RetrievalDocumentRevisionsAssembler.toLoadRetrievalDocumentRevisionsDTO(
      loadRetrievalDocumentRevisionsDTO,
    )
    const uniqueRetrievalDocumentRevisionIds = [...new Set(revisionIds)]

    if (uniqueRetrievalDocumentRevisionIds.length === 0) return []

    const retrievalScopeDocumentRevisions = await this.documentRevisionRepository.findByDocumentRevisionIds({
      ids: uniqueRetrievalDocumentRevisionIds,
    })

    return retrievalScopeDocumentRevisions.filter((retrievalDocumentRevision) =>
      uniqueRetrievalDocumentRevisionIds.includes(retrievalDocumentRevision.id),
    )
  }
}
