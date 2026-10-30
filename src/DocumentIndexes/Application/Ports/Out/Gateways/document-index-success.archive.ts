import type { DocumentIndexSuccessReceiptDTO } from '../../../DataTransferObjects/document-index-success-receipt.dto.ts'
import type {
  ArchiveDocumentIndexSuccessQueryObject,
  FindDocumentIndexSuccessByProjectIdAndJobIdQueryObject,
} from '../../../QueryObjects/document-index-success.query-object.ts'

/** Durable success receipts owned by document-index listeners. */
export abstract class DocumentIndexSuccessArchive {
  abstract archiveSuccess(archiveDocumentIndexSuccessQO: ArchiveDocumentIndexSuccessQueryObject): Promise<void>

  abstract findSuccessByProjectIdAndJobId(
    findDocumentIndexSuccessByProjectIdAndJobIdQO: FindDocumentIndexSuccessByProjectIdAndJobIdQueryObject,
  ): Promise<DocumentIndexSuccessReceiptDTO | null>
}
