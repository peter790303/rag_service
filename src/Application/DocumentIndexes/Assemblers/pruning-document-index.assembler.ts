import type { MembershipRetentionDto } from '../../Memberships/DataTransferObjects/membership-retention.dto.ts'
import type { MembershipPruningRequestedEvent } from '../../Memberships/Events/membership-pruning-requested.event.ts'
import type { DocumentIndexExecutionsForMembershipQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'
import type { DocumentIndexExecutionIdQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'
import type { DocumentIndexIdQueryObject } from '../QueryObjects/document-index.query-object.ts'

export class PruningDocumentIndexAssembler {
  static toDocumentIndexExecutionIdQueryObject(jobId: string): DocumentIndexExecutionIdQueryObject {
    return { jobId }
  }

  static toDocumentIndexIdQueryObject(documentIndexId: string): DocumentIndexIdQueryObject {
    return { documentIndexId }
  }

  static toInspectMembershipRetentionDTO(documentIndexId: string): MembershipRetentionDto {
    return { documentIndexId }
  }

  static toDocumentIndexExecutionsForMembershipQueryObject(
    event: MembershipPruningRequestedEvent,
  ): DocumentIndexExecutionsForMembershipQueryObject {
    return {
      knowledgeBaseId: event.knowledgeBaseId,
      documentId: event.documentId,
    }
  }
}
