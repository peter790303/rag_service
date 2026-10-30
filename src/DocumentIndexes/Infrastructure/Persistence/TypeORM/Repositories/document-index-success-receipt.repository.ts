import { Injectable } from '@nestjs/common'

import { PersistenceTransaction } from '../../../../../Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import type { DocumentIndexSuccessReceiptDTO } from '../../../../Application/DTOs/document-index-success-receipt.dto.ts'
import { DocumentIndexSuccessArchive } from '../../../../Application/Ports/Out/Gateways/document-index-success.archive.ts'
import type {
  ArchiveDocumentIndexSuccessParams,
  FindDocumentIndexSuccessByProjectIdAndJobIdParams,
} from '../../../../Application/Ports/Out/Gateways/document-index-success.params.ts'
import { DocumentIndexSuccessReceiptAdapter } from '../Adapters/document-index-success-receipt.adapter.ts'
import { DocumentIndexSuccessReceiptModel } from '../Models/document-index-success-receipt.model.ts'

/** Persists successful document-index receipts in the current transaction. */
@Injectable()
export class DocumentIndexSuccessReceiptRepository extends DocumentIndexSuccessArchive {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get successReceiptModelRepository() {
    return this.persistenceTransaction.manager.getRepository(DocumentIndexSuccessReceiptModel)
  }

  async archiveSuccess(archiveDocumentIndexSuccessQO: ArchiveDocumentIndexSuccessParams): Promise<void> {
    const receiptAttributes = DocumentIndexSuccessReceiptAdapter.toPersistence(archiveDocumentIndexSuccessQO)
    await this.successReceiptModelRepository.insert(receiptAttributes)
  }

  async findSuccessByProjectIdAndJobId(
    findDocumentIndexSuccessByProjectIdAndJobIdQO: FindDocumentIndexSuccessByProjectIdAndJobIdParams,
  ): Promise<DocumentIndexSuccessReceiptDTO | null> {
    const { jobId, projectId } = findDocumentIndexSuccessByProjectIdAndJobIdQO
    const receipt = await this.successReceiptModelRepository.findOneBy({ jobId, projectId })

    return DocumentIndexSuccessReceiptAdapter.toNullableDTO(receipt)
  }
}
