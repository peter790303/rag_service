import type {
  ArchiveDocumentIndexSuccessParams,
  FindDocumentIndexSuccessByProjectIdAndJobIdParams,
} from './document-index-success.params.ts'
import type { DocumentIndexSuccessReceiptDTO } from '../../../DTOs/document-index-success-receipt.dto.ts'

/** Durable success receipts owned by document-index listeners. */
export abstract class DocumentIndexSuccessArchive {
  abstract archiveSuccess(archiveDocumentIndexSuccessQO: ArchiveDocumentIndexSuccessParams): Promise<void>

  abstract findSuccessByProjectIdAndJobId(
    findDocumentIndexSuccessByProjectIdAndJobIdQO: FindDocumentIndexSuccessByProjectIdAndJobIdParams,
  ): Promise<DocumentIndexSuccessReceiptDTO | null>
}
