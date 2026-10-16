import type { Document } from '../../../Domain/Document/document.ts'
import type { LockDocumentRetentionParentsDto } from '../DataTransferObjects/document-retention-scope.dto.ts'

export abstract class LockDocumentRetentionParentsUseCaseContract {
  abstract execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsDto): Promise<Document[]>
}
