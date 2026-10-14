import { ChunkPlanningUnavailableException } from '../../../Domain/Knowledge/Exceptions/chunk-planning-unavailable.exception.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import type { MarkdownPlan, PlannedChunk, PlannedRelation } from '../../../Domain/Knowledge/markdown-chunk.factory.js'

const plannedRelationTypes = new Set(['markdown_link', 'wiki_link', 'requires', 'applies_to', 'overrides'])

/** Validates provider output before the replacement transaction starts. */
export class RagIndexReplacementGuard {
  static assertValidPlan(plan: MarkdownPlan): void {
    if (!plan || !Array.isArray(plan.chunks) || !Array.isArray(plan.relations)) {
      throw new ChunkPlanningUnavailableException()
    }

    if (
      !plan.chunks.every((chunk) => RagIndexReplacementGuard.isValidChunk(chunk)) ||
      !plan.relations.every((relation) => RagIndexReplacementGuard.isValidRelation(relation))
    ) {
      throw new ChunkPlanningUnavailableException()
    }
  }

  private static isValidChunk(chunk: PlannedChunk): boolean {
    return Boolean(
      chunk &&
      typeof chunk.content === 'string' &&
      Array.isArray(chunk.headingPath) &&
      chunk.headingPath.every((heading) => typeof heading === 'string') &&
      Number.isInteger(chunk.blockStart) &&
      chunk.blockStart >= 0 &&
      Number.isInteger(chunk.blockEnd) &&
      chunk.blockEnd >= chunk.blockStart &&
      Number.isInteger(chunk.tokenCount) &&
      chunk.tokenCount >= 0,
    )
  }

  private static isValidRelation(relation: PlannedRelation): boolean {
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

  static assertAlignedOutputs(
    plan: MarkdownPlan,
    vectors: readonly number[][],
    lexicalSearchTexts: readonly string[],
  ): void {
    if (
      !Array.isArray(vectors) ||
      vectors.length !== plan.chunks.length ||
      !vectors.every((vector) => RagIndexReplacementGuard.isValidVector(vector)) ||
      !Array.isArray(lexicalSearchTexts) ||
      lexicalSearchTexts.length !== plan.chunks.length ||
      !lexicalSearchTexts.every((text) => typeof text === 'string')
    ) {
      throw new KnowledgeEmbeddingUnavailableException()
    }
  }

  private static isValidVector(vector: number[]): boolean {
    return Array.isArray(vector) && vector.length > 0 && vector.every((value) => Number.isFinite(value))
  }

  static assertValidDate(now: Date): void {
    if (!(now instanceof Date) || !Number.isFinite(now.getTime())) throw new TypeError('Replacement time must be valid')
  }
}
