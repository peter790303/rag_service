import type { PlannedDocumentRelation } from '../../../DocumentRelations/Application/DataTransferObjects/planned-document-relation.dto.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../KnowledgeBases/Application/Exceptions/knowledge-embedding-unavailable.exception.ts'
import type { MarkdownChunkPlan } from '../DataTransferObjects/markdown-chunk-plan.dto.ts'
import type { PlannedMarkdownChunk } from '../DataTransferObjects/planned-markdown-chunk.dto.ts'
import { ChunkPlanningUnavailableException } from '../Exceptions/chunk-planning-unavailable.exception.ts'

const plannedRelationTypes = new Set(['markdown_link', 'wiki_link', 'requires', 'applies_to', 'overrides'])

/** Validates provider output before the replacement transaction starts. */
export class ReplacementChunkGuard {
  static assertValidPlan(markdownChunkPlan: MarkdownChunkPlan): void {
    if (!markdownChunkPlan || !Array.isArray(markdownChunkPlan.chunks) || !Array.isArray(markdownChunkPlan.relations)) {
      throw new ChunkPlanningUnavailableException()
    }

    if (
      !Array.from(markdownChunkPlan.chunks).every((chunk) => ReplacementChunkGuard.isValidChunk(chunk)) ||
      !Array.from(markdownChunkPlan.relations).every((relation) => ReplacementChunkGuard.isValidRelation(relation))
    ) {
      throw new ChunkPlanningUnavailableException()
    }
  }

  private static isValidChunk(chunk: PlannedMarkdownChunk): boolean {
    return Boolean(
      chunk &&
      typeof chunk.content === 'string' &&
      Array.isArray(chunk.headingPath) &&
      Array.from(chunk.headingPath).every((heading) => typeof heading === 'string') &&
      typeof chunk.blockStart === 'number' &&
      typeof chunk.blockEnd === 'number' &&
      typeof chunk.tokenCount === 'number',
    )
  }

  private static isValidRelation(relation: PlannedDocumentRelation): boolean {
    return Boolean(
      relation &&
      typeof relation.targetReference === 'string' &&
      relation.targetReference.trim().length > 0 &&
      (relation.targetAnchor === null || typeof relation.targetAnchor === 'string') &&
      typeof relation.relationType === 'string' &&
      plannedRelationTypes.has(relation.relationType) &&
      Number.isInteger(relation.evidenceBlockStart) &&
      relation.evidenceBlockStart >= 0 &&
      Number.isInteger(relation.evidenceBlockEnd) &&
      relation.evidenceBlockEnd >= relation.evidenceBlockStart &&
      typeof relation.evidenceText === 'string',
    )
  }

  static assertAlignedOutputs(markdownChunkPlan: MarkdownChunkPlan, chunkEmbeddings: readonly number[][]): void {
    if (
      !Array.isArray(chunkEmbeddings) ||
      chunkEmbeddings.length !== markdownChunkPlan.chunks.length ||
      !Array.from(chunkEmbeddings).every((chunkEmbedding) => ReplacementChunkGuard.isValidVector(chunkEmbedding))
    ) {
      throw new KnowledgeEmbeddingUnavailableException()
    }
  }

  private static isValidVector(chunkEmbedding: number[]): boolean {
    return (
      Array.isArray(chunkEmbedding) &&
      chunkEmbedding.length > 0 &&
      Array.from(chunkEmbedding).every((embeddingComponent) => Number.isFinite(embeddingComponent))
    )
  }
}
