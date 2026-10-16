import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { InspectDocumentRetentionDto } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { DocumentRelationRepository } from '../Contracts/document-relation.repository.ts'
import type { InspectDocumentRelationRetentionUseCaseContract } from '../Contracts/inspect-document-relation-retention.use-case.contract.ts'

export class InspectDocumentRelationRetentionUseCase implements InspectDocumentRelationRetentionUseCaseContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDto): Promise<DocumentRelation | null> {
    return this.documentRelationRepository.findByTargetDocumentId(
      GarbageDocumentRelationAssembler.toDocumentRelationTargetDocumentQueryObject(
        inspectDocumentRetentionDTO.documentId,
      ),
    )
  }
}
