import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentIndexExecutionQueue } from '../../DocumentIndexes/Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../../DocumentIndexes/Contracts/document-index-failure.archive.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../../DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import type { InspectDocumentRelationRetentionUseCaseContract } from '../../DocumentRelations/Contracts/inspect-document-relation-retention.use-case.contract.ts'
import type { InspectDocumentRevisionRetentionUseCaseContract } from '../../DocumentRevisions/Contracts/inspect-document-revision-retention.use-case.contract.ts'
import type { InspectKnowledgeBaseDocumentRetentionUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/inspect-knowledge-base-document-retention.use-case.contract.ts'
import { RetentionDocumentAssembler } from '../Assemblers/retention-document.assembler.ts'
import type { DocumentRepository } from '../Contracts/document.repository.ts'
import type { InspectDocumentRetentionUseCaseContract } from '../Contracts/inspect-document-retention.use-case.contract.ts'
import type { InspectDocumentRetentionDTO } from '../DataTransferObjects/document-retention-scope.dto.ts'

export class InspectDocumentRetentionUseCase implements InspectDocumentRetentionUseCaseContract {
  constructor(
    private readonly knowledgeBaseDocumentRetention: InspectKnowledgeBaseDocumentRetentionUseCaseContract,
    private readonly revisionRetention: InspectDocumentRevisionRetentionUseCaseContract,
    private readonly indexRetention: InspectDocumentIndexRetentionUseCaseContract,
    private readonly relationRetention: InspectDocumentRelationRetentionUseCaseContract,
    private readonly documentRepository: DocumentRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(inspectDocumentRetentionDTO: InspectDocumentRetentionDTO): Promise<Document | null> {
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
