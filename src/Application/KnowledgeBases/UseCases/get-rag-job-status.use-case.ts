import { RagJobStatusReader } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-job-management.js'
import type { RagJobStatusDto } from '../DataTransferObjects/rag.dto.js'

export class GetRagJobStatusUseCase {
  constructor(private readonly rag: RagJobStatusReader) {}

  execute(projectId: string, id: string): Promise<RagJobStatusDto> {
    return this.rag.jobStatus(projectId, id)
  }
}
