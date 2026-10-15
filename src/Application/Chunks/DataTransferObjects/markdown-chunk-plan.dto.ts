import type { PlannedMarkdownChunk } from './planned-markdown-chunk.dto.ts'
import type { PlannedDocumentRelation } from '../../DocumentRelations/DataTransferObjects/planned-document-relation.dto.ts'

export interface MarkdownChunkPlan {
  chunks: PlannedMarkdownChunk[]
  relations: PlannedDocumentRelation[]
}
