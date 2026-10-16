import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'

export abstract class PrepareMembershipForIndexRequestUseCaseContract {
  abstract execute(prepareMembershipForIndexRequestDTO: {
    sourceDocument: SourceDocumentDto
    documentId: string
  }): Promise<Membership>
}
