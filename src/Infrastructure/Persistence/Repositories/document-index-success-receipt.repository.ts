import { Injectable } from '@nestjs/common'

import { DocumentIndexSuccessArchive } from '../../../Application/DocumentIndexes/Contracts/document-index-success.archive.ts'
import type { DocumentIndexSuccessReceiptDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-success-receipt.dto.ts'
import type {
  ArchiveDocumentIndexSuccessQueryObject,
  FindDocumentIndexSuccessByProjectIdAndJobIdQueryObject,
} from '../../../Application/DocumentIndexes/QueryObjects/document-index-success.query-object.ts'
import { DocumentIndexSuccessReceiptAdapter } from '../Adapters/document-index-success-receipt.adapter.ts'
import { DocumentIndexSuccessReceiptModel } from '../Models/document-index-success-receipt.model.ts'
import { PersistenceTransaction } from '../persistence-transaction.ts'

/** Persists successful document-index receipts in the current transaction. */
@Injectable()
export class DocumentIndexSuccessReceiptRepository extends DocumentIndexSuccessArchive {
  constructor(private readonly persistenceTransaction: PersistenceTransaction) {
    super()
  }

  private get successReceiptModelRepository() {
    return this.persistenceTransaction.manager.getRepository(DocumentIndexSuccessReceiptModel)
  }

  async archiveSuccess(archiveDocumentIndexSuccessQO: ArchiveDocumentIndexSuccessQueryObject): Promise<void> {
    const receiptAttributes = DocumentIndexSuccessReceiptAdapter.toPersistence(archiveDocumentIndexSuccessQO)
    await this.successReceiptModelRepository.insert(receiptAttributes)
  }

  async findSuccessByProjectIdAndJobId(
    findDocumentIndexSuccessByProjectIdAndJobIdQO: FindDocumentIndexSuccessByProjectIdAndJobIdQueryObject,
  ): Promise<DocumentIndexSuccessReceiptDTO | null> {
    const { jobId, projectId } = findDocumentIndexSuccessByProjectIdAndJobIdQO
    const receipt = await this.successReceiptModelRepository.findOneBy({ jobId, projectId })

    return DocumentIndexSuccessReceiptAdapter.toNullableDTO(receipt)
  }
}
