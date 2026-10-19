import type { KnowledgeBaseDocumentRetentionDTO } from '../../KnowledgeBaseDocuments/DataTransferObjects/knowledge-base-document-retention.dto.ts'
import type { KnowledgeBaseDocumentPruningStartedEvent } from '../../KnowledgeBaseDocuments/Events/knowledge-base-document-pruning-started.event.ts'
import type { DocumentIndexExecutionsForKnowledgeBaseDocumentQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'
import type { DocumentIndexExecutionIdQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'
import type { DocumentIndexIdQueryObject } from '../QueryObjects/document-index.query-object.ts'

export class PruningDocumentIndexAssembler {
  static toDocumentIndexExecutionIdQueryObject(jobId: string): DocumentIndexExecutionIdQueryObject {
    return { jobId }
  }

  static toDocumentIndexIdQueryObject(documentIndexId: string): DocumentIndexIdQueryObject {
    return { documentIndexId }
  }

  static toInspectKnowledgeBaseDocumentRetentionDTO(documentIndexId: string): KnowledgeBaseDocumentRetentionDTO {
    return { documentIndexId }
  }

  static toDocumentIndexExecutionsForKnowledgeBaseDocumentQueryObject(
    event: KnowledgeBaseDocumentPruningStartedEvent,
  ): DocumentIndexExecutionsForKnowledgeBaseDocumentQueryObject {
    return {
      knowledgeBaseId: event.knowledgeBaseId,
      documentId: event.documentId,
    }
  }
}
