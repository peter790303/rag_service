import type {
  RagIndexRequestResult,
  RagJobStatusDto,
  RetryFailedJobDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'

export class RagIndexRequestResource {
  static from(result: RagIndexRequestResult): RagIndexRequestResult {
    return result
  }
}

export class RagJobStatusResource {
  static from(result: RagJobStatusDto): RagJobStatusDto {
    return result
  }
}

export class RetryFailedJobResource {
  static from(result: RetryFailedJobDto): RetryFailedJobDto {
    return result
  }
}
