import type { DocumentIndexRequestResult } from '../../../Application/DataTransferObjects/document-index-request.dto.ts'

export class DocumentIndexRequestResource {
  static toDocumentIndexRequestResource(
    documentIndexRequestResult: DocumentIndexRequestResult,
  ): DocumentIndexRequestResult {
    return {
      documentId: documentIndexRequestResult.documentId,
      revisionId: documentIndexRequestResult.revisionId,
      documentIndexId: documentIndexRequestResult.documentIndexId,
      jobId: documentIndexRequestResult.jobId,
      generation: documentIndexRequestResult.generation,
      reusedReadyIndex: documentIndexRequestResult.reusedReadyIndex,
      blockedByFailedJob: documentIndexRequestResult.blockedByFailedJob,
    }
  }
}
