import type { EnsureIndexingKnowledgeBaseDTO } from '../DataTransferObjects/ensure-indexing-knowledge-base.dto.ts'

export abstract class EnsureIndexingKnowledgeBaseUseCaseContract {
  abstract execute(ensureIndexingKnowledgeBaseDTO: EnsureIndexingKnowledgeBaseDTO): Promise<void>
}
