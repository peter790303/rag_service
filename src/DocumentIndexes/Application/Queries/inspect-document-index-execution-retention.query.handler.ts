import type { InspectDocumentIndexExecutionRetentionQueryHandlerContract } from '../Contracts/inspect-document-index-execution-retention.query.handler.contract.ts'
import type { DocumentIndexExecutionRetentionDTO } from '../DataTransferObjects/document-index-execution-retention.dto.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Ports/Out/Gateways/document-index-failure.archive.ts'
import type { InspectDocumentIndexExecutionRetentionQuery } from '../Queries/inspect-document-index-execution-retention.query.ts'

export class InspectDocumentIndexExecutionRetentionQueryHandler implements InspectDocumentIndexExecutionRetentionQueryHandlerContract {
  constructor(
    private readonly executionQueue: DocumentIndexExecutionQueue,
    private readonly failureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(query: InspectDocumentIndexExecutionRetentionQuery): Promise<DocumentIndexExecutionRetentionDTO> {
    const executionCount = await this.executionQueue.countDocumentExecutions({ documentId: query.documentId })
    const failureCount = await this.failureArchive.countDocumentFailures({ documentId: query.documentId })

    return { protectsDocument: executionCount > 0 || failureCount > 0 }
  }
}
