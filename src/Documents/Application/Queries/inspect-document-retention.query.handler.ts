import type { InspectDocumentRetentionQuery } from './inspect-document-retention.query.ts'
import type { InspectDocumentIndexExecutionRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-execution-retention.query.handler.contract.ts'
import type { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import type { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import type { InspectDocumentRevisionRetentionQueryHandlerContract } from '../../../DocumentRevisions/Application/Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBaseDocuments/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { InspectDocumentRetentionQueryHandlerContract } from '../Contracts/inspect-document-retention.query.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

export class InspectDocumentRetentionQueryHandler implements InspectDocumentRetentionQueryHandlerContract {
  constructor(
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
    private readonly revisionRetention: InspectDocumentRevisionRetentionQueryHandlerContract,
    private readonly indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
    private readonly relationRetention: InspectDocumentRelationRetentionQueryHandlerContract,
    private readonly documentRepository: DocumentRepository,
    private readonly executionRetention: InspectDocumentIndexExecutionRetentionQueryHandlerContract,
  ) {}

  async execute(inspectDocumentRetentionQuery: InspectDocumentRetentionQuery): Promise<Document | null> {
    const knowledgeBaseDocumentProtectsDocument = await this.knowledgeBaseDocumentRetention.execute(
      RetentionDocumentAssembler.toInspectKnowledgeBaseDocumentRetentionQuery(inspectDocumentRetentionQuery),
    )
    const revisionProtectsDocument = await this.revisionRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRevisionRetentionQuery(inspectDocumentRetentionQuery.documentId),
    )
    const indexProtectsDocument = await this.indexRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentIndexRetentionQuery(inspectDocumentRetentionQuery),
    )
    const relationProtectsDocument = await this.relationRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRelationRetentionQuery(inspectDocumentRetentionQuery.documentId),
    )
    const executionRetention = await this.executionRetention.execute({
      documentId: inspectDocumentRetentionQuery.documentId,
    })

    if (
      !knowledgeBaseDocumentProtectsDocument &&
      !revisionProtectsDocument &&
      !indexProtectsDocument &&
      !relationProtectsDocument &&
      !executionRetention.protectsDocument
    )
      return null

    return this.documentRepository.findByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(inspectDocumentRetentionQuery.documentId),
    )
  }
}
