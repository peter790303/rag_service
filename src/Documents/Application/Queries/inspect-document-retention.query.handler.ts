import type { InspectDocumentRetentionQuery } from './inspect-document-retention.query.ts'
import type { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import type { DocumentIndexExecutionQueue } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../../DocumentIndexes/Application/Ports/Out/Gateways/document-index-failure.archive.ts'
import type { InspectKnowledgeBaseDocumentRetentionQueryHandlerContract } from '../../../KnowledgeBases/Application/Contracts/inspect-knowledge-base-document-retention.query.handler.contract.ts'
import type { Document } from '../../Domain/Entities/document.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { InspectDocumentRelationRetentionQueryHandlerContract } from '../Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import type { InspectDocumentRetentionQueryHandlerContract } from '../Contracts/inspect-document-retention.query.handler.contract.ts'
import type { InspectDocumentRevisionRetentionQueryHandlerContract } from '../Contracts/inspect-document-revision-retention.query.handler.contract.ts'
import type { DocumentRepository } from '../Ports/Out/Repositories/document.repository.ts'

export class InspectDocumentRetentionQueryHandler implements InspectDocumentRetentionQueryHandlerContract {
  constructor(
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionQueryHandlerContract,
    private readonly revisionRetention: InspectDocumentRevisionRetentionQueryHandlerContract,
    private readonly indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
    private readonly relationRetention: InspectDocumentRelationRetentionQueryHandlerContract,
    private readonly documentRepository: DocumentRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(inspectDocumentRetentionDTO: InspectDocumentRetentionQuery): Promise<Document | null> {
    const knowledgeBaseDocumentProtectsDocument = await this.knowledgeBaseDocumentRetention.execute(
      RetentionDocumentAssembler.toKnowledgeBaseDocumentRetentionDTO(inspectDocumentRetentionDTO),
    )
    const revisionProtectsDocument = await this.revisionRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRevisionRetentionDTO(inspectDocumentRetentionDTO.documentId),
    )
    const indexProtectsDocument = await this.indexRetention.execute(
      RetentionDocumentAssembler.toDocumentIndexRetentionDTO(inspectDocumentRetentionDTO),
    )
    const relationProtectsDocument = await this.relationRetention.execute(
      RetentionDocumentAssembler.toInspectDocumentRelationRetentionDTO(inspectDocumentRetentionDTO.documentId),
    )
    const executionCount = await this.documentIndexExecutionQueue.countDocumentExecutions({
      documentId: inspectDocumentRetentionDTO.documentId,
    })
    const failureCount = await this.documentIndexFailureArchive.countDocumentFailures({
      documentId: inspectDocumentRetentionDTO.documentId,
    })

    if (
      !knowledgeBaseDocumentProtectsDocument &&
      !revisionProtectsDocument &&
      !indexProtectsDocument &&
      !relationProtectsDocument &&
      executionCount === 0 &&
      failureCount === 0
    )
      return null

    return this.documentRepository.findByDocumentId(
      RetentionDocumentAssembler.toDocumentIdQO(inspectDocumentRetentionDTO.documentId),
    )
  }
}
