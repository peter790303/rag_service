import type { DateTime } from '../../../Domain/Document/ValueObjects/date-time.ts'
import type { DocumentIndexRetentionDto } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { MembershipRetentionDto } from '../../Memberships/DataTransferObjects/membership-retention.dto.ts'
import type { InspectDocumentRetentionDto } from '../DataTransferObjects/document-retention-scope.dto.ts'
import type {
  DocumentIdQueryObject,
  MarkDocumentUnreferencedQueryObject,
} from '../QueryObjects/document.query-object.ts'

export class RetentionDocumentAssembler {
  static toDocumentIdQO(documentId: string): DocumentIdQueryObject {
    return { documentId }
  }

  static toInspectDocumentRetentionDTO(documentId: string): InspectDocumentRetentionDto {
    return { documentId }
  }

  static toMembershipRetentionDTO(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): MembershipRetentionDto {
    return { documentId: inspectDocumentRetentionDTO.documentId }
  }

  static toDocumentIndexRetentionDTO(
    inspectDocumentRetentionDTO: InspectDocumentRetentionDto,
  ): DocumentIndexRetentionDto {
    return { documentId: inspectDocumentRetentionDTO.documentId }
  }

  static toMarkDocumentUnreferencedQO(documentId: string, now: DateTime): MarkDocumentUnreferencedQueryObject {
    return { documentId, unreferencedSince: now.nativeDate }
  }
}
