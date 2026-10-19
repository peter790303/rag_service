import type { Document } from '../../../Domain/Document/document.ts'
import type { LockDocumentRetentionParentsDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'

export abstract class LockDocumentRetentionParentsUseCaseContract {
  abstract execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsDTO): Promise<Document[]>
}
