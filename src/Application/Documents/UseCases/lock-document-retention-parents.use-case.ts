import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { Document } from '../../../Domain/Document/document.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { LockDocumentRetentionParentsUseCaseContract } from '../Contracts/lock-document-retention-parents.use-case.contract.ts'
import type { LockDocumentRetentionParentsDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'

export class LockDocumentRetentionParentsUseCase implements LockDocumentRetentionParentsUseCaseContract {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsDTO): Promise<Document[]> {
    const documentIds = [...new Set(lockDocumentRetentionParentsDTO.documentIds)].sort()
    const lockDocument = (documentId: string): Promise<Document | null> =>
      this.documentRepository.lockByDocumentId(RetentionDocumentAssembler.toDocumentIdQO(documentId))
    const isLockedDocument = (document: Document | null): document is Document => document !== null

    // Keep one parent lock in flight so concurrent transactions acquire parents in the same order.
    return firstValueFrom(from(documentIds).pipe(concatMap(lockDocument), filter(isLockedDocument), toArray()))
  }
}
