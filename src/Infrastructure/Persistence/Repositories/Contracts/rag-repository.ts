import type {
  RagJobStatusDto,
  RetryFailedJobDto,
} from '../../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'

/** Application port for knowledge-base operations. */
export abstract class RagRepository {
  abstract jobStatus(projectId: string, id: string): Promise<RagJobStatusDto>

  abstract retryFailedJob(projectId: string, failedJobId: string): Promise<RetryFailedJobDto>

  abstract pruneMemberships(knowledgeBaseId: string, documentIds: string[]): Promise<unknown>
}
