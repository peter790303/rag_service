import type { PlannedMarkdownChunk } from './planned-markdown-chunk.dto.ts'
import type { PlannedDocumentRelation } from '../../../DocumentRelations/Application/DTOs/planned-document-relation.dto.ts'

export interface MarkdownChunkPlan {
  chunks: PlannedMarkdownChunk[]
  relations: PlannedDocumentRelation[]
}
