import type { Document } from '../../Domain/Entities/document.ts'
import type { LockDocumentRetentionParentsCommand } from '../Commands/lock-document-retention-parents.command.ts'

export abstract class LockDocumentRetentionParentsCommandHandlerContract {
  abstract execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsCommand): Promise<Document[]>
}
