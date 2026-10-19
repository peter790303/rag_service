import type { DateTime } from '../../../Domain/Document/ValueObjects/date-time.ts'
import type { DocumentIndexRetentionDTO } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { InspectDocumentRelationRetentionDTO } from '../../DocumentRelations/DataTransferObjects/inspect-document-relation-retention.dto.ts'
import type { InspectDocumentRevisionRetentionDTO } from '../../DocumentRevisions/DataTransferObjects/inspect-document-revision-retention.dto.ts'
import type { KnowledgeBaseDocumentRetentionDTO } from '../../KnowledgeBaseDocuments/DataTransferObjects/knowledge-base-document-retention.dto.ts'
import type { InspectDocumentRetentionDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'
import type {
  DocumentIdQueryObject,
  MarkDocumentUnreferencedQueryObject,
} from '../QueryObjects/document.query-object.ts'

export class RetentionDocumentAssembler {
  static toDocumentIdQO(documentId: string): DocumentIdQueryObject {
    return { documentId }
  }

  static toInspectDocumentRetentionDTO(documentId: string): InspectDocumentRetentionDTO {
    return { documentId }
  }

  static toInspectDocumentRevisionRetentionDTO(documentId: string): InspectDocumentRevisionRetentionDTO {
    return { documentId }
  }

  static toInspectDocumentRelationRetentionDTO(documentId: string): InspectDocumentRelationRetentionDTO {
    return { documentId }
  }

  static toKnowledgeBaseDocumentRetentionDTO(
    inspectDocumentRetentionDTO: InspectDocumentRetentionDTO,
  ): KnowledgeBaseDocumentRetentionDTO {
    return { documentId: inspectDocumentRetentionDTO.documentId }
  }

  static toDocumentIndexRetentionDTO(
    inspectDocumentRetentionDTO: InspectDocumentRetentionDTO,
  ): DocumentIndexRetentionDTO {
    return { documentId: inspectDocumentRetentionDTO.documentId }
  }

  static toMarkDocumentUnreferencedQO(documentId: string, now: DateTime): MarkDocumentUnreferencedQueryObject {
    return { documentId, unreferencedSince: now.nativeDate }
  }
}
