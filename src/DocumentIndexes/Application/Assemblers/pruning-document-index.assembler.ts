import type { KnowledgeBaseDocumentPruningStartedEvent } from '../../../KnowledgeBaseDocuments/Application/Events/knowledge-base-document-pruning-started.event.ts'
import type { InspectKnowledgeBaseDocumentRetentionQuery } from '../../../KnowledgeBaseDocuments/Application/Queries/inspect-knowledge-base-document-retention.query.ts'
import type { DocumentIndexExecutionsForKnowledgeBaseDocumentParams } from '../Ports/Out/Gateways/document-index-execution.params.ts'
import type { DocumentIndexExecutionIdParams } from '../Ports/Out/Gateways/document-index-execution.params.ts'
import type { DocumentIndexIdQO } from '../QueryObjects/document-index.query-object.ts'

export class PruningDocumentIndexAssembler {
  static toDocumentIndexExecutionIdParams(jobId: string): DocumentIndexExecutionIdParams {
    return { jobId }
  }

  static toDocumentIndexIdQO(documentIndexId: string): DocumentIndexIdQO {
    return { documentIndexId }
  }

  static toInspectKnowledgeBaseDocumentRetentionQuery(
    documentIndexId: string,
  ): InspectKnowledgeBaseDocumentRetentionQuery {
    return { documentIndexId }
  }

  static toDocumentIndexExecutionsForKnowledgeBaseDocumentParams(
    event: KnowledgeBaseDocumentPruningStartedEvent,
  ): DocumentIndexExecutionsForKnowledgeBaseDocumentParams {
    return {
      knowledgeBaseId: event.knowledgeBaseId,
      documentId: event.documentId,
    }
  }
}
