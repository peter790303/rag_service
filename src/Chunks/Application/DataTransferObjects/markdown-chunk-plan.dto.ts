import type { PlannedMarkdownChunk } from './planned-markdown-chunk.dto.ts'
import type { PlannedDocumentRelation } from '../../../DocumentRelations/Application/DataTransferObjects/planned-document-relation.dto.ts'

export interface MarkdownChunkPlan {
  chunks: PlannedMarkdownChunk[]
  relations: PlannedDocumentRelation[]
}
