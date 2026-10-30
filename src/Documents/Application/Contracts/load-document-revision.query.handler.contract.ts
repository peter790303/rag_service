import type { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import type { LoadDocumentRevisionQuery } from '../Queries/load-document-revision.query.ts'

export abstract class LoadDocumentRevisionQueryHandlerContract {
  abstract execute(loadDocumentRevisionDTO: LoadDocumentRevisionQuery): Promise<DocumentRevision | null>
}
