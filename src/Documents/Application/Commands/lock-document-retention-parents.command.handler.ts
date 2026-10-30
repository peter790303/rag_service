import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { LockDocumentRetentionParentsCommand } from './lock-document-retention-parents.command.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { LockDocumentRetentionParentsCommandHandlerContract } from '../Contracts/lock-document-retention-parents.command.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

export class LockDocumentRetentionParentsCommandHandler implements LockDocumentRetentionParentsCommandHandlerContract {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsCommand): Promise<Document[]> {
    const documentIds = [...new Set(lockDocumentRetentionParentsDTO.documentIds)].sort()
    const lockDocument = (documentId: string): Promise<Document | null> =>
      this.documentRepository.lockByDocumentId(RetentionDocumentAssembler.toDocumentIdQO(documentId))
    const isLockedDocument = (document: Document | null): document is Document => document !== null

    // Keep one parent lock in flight so concurrent transactions acquire parents in the same order.
    return firstValueFrom(from(documentIds).pipe(concatMap(lockDocument), filter(isLockedDocument), toArray()))
  }
}
