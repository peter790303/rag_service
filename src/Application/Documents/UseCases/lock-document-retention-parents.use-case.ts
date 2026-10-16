import type { Document } from '../../../Domain/Document/document.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { LockDocumentRetentionParentsUseCaseContract } from '../Contracts/lock-document-retention-parents.use-case.contract.ts'
import type { LockDocumentRetentionParentsDto } from '../DataTransferObjects/document-retention-scope.dto.ts'

export class LockDocumentRetentionParentsUseCase implements LockDocumentRetentionParentsUseCaseContract {
  constructor(private readonly documentRepository: DocumentRepository) {}

  async execute(lockDocumentRetentionParentsDTO: LockDocumentRetentionParentsDto): Promise<Document[]> {
    const lockedDocuments: Document[] = []
    await [...new Set(lockDocumentRetentionParentsDTO.documentIds)].sort().reduce(async (previous, documentId) => {
      await previous

      const document = await this.documentRepository.lockByDocumentId(
        RetentionDocumentAssembler.toDocumentIdQO(documentId),
      )

      if (document) lockedDocuments.push(document)
    }, Promise.resolve())

    return lockedDocuments
  }
}
