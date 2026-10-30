import type { InspectDocumentRelationRetentionQuery } from './inspect-document-relation-retention.query.ts'
import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import { GarbageDocumentRelationAssembler } from '../Assemblers/garbage-document-relation.assembler.ts'
import type { InspectDocumentRelationRetentionQueryHandlerContract } from '../Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { DocumentRelationInputGuard } from '../Guards/document-relation-input.guard.ts'
import type { DocumentRelationRepository } from '../Ports/Out/Repositories/document-relation.repository.ts'

export class InspectDocumentRelationRetentionQueryHandler implements InspectDocumentRelationRetentionQueryHandlerContract {
  constructor(private readonly documentRelationRepository: DocumentRelationRepository) {}

  async execute(
    inspectDocumentRelationRetentionDTO: InspectDocumentRelationRetentionQuery,
  ): Promise<DocumentRelation | null> {
    DocumentRelationInputGuard.assertObject(inspectDocumentRelationRetentionDTO)
    DocumentRelationInputGuard.assertIdentifier(inspectDocumentRelationRetentionDTO.documentId, 'documentId')

    return this.documentRelationRepository.findByTargetDocumentId(
      GarbageDocumentRelationAssembler.toDocumentRelationTargetDocumentQueryObject(
        inspectDocumentRelationRetentionDTO.documentId,
      ),
    )
  }
}
