import type { Chunk } from '../../../../Chunks/Domain/Entities/chunk.ts'
import type { KnowledgeBase } from '../../../Domain/Entities/knowledge-base.ts'
import type {
  KnowledgeBaseRetrievalDocument,
  KnowledgeBaseRetrievalMatch,
  KnowledgeBaseRetrievalRelation,
} from '../../../Domain/ValueObjects/knowledge-base-retrieval.ts'

type StableRetrievedMatch = {
  chunk: { source: string; documentReference: string; chunkIndex: number; id: string }
}

const compareText = (left: string, right: string): number => (left < right ? -1 : left > right ? 1 : 0)

export const exhaustiveRetrievePage = <TMatch extends StableRetrievedMatch>(matches: readonly TMatch[]) => {
  const ordered = [...matches].sort(
    (left, right) =>
      compareText(left.chunk.source, right.chunk.source) ||
      compareText(left.chunk.documentReference, right.chunk.documentReference) ||
      left.chunk.chunkIndex - right.chunk.chunkIndex ||
      compareText(left.chunk.id, right.chunk.id),
  )

  return { matches: ordered.slice(0, 1000), truncated: ordered.length > 1000 }
}

export class HybridKnowledgeRetrievalResource {
  static toHybridKnowledgeRetrievalResource(knowledgeBase: KnowledgeBase | null, exhaustive = false) {
    const retrieval = knowledgeBase?.retrieval

    if (knowledgeBase === null || !retrieval) return { matches: [], fullContentDocuments: [], truncated: false }

    const matches = retrieval.matches.map((match) =>
      HybridKnowledgeRetrievalResource.toRetrievalMatchResource(knowledgeBase.projectId, match),
    )
    const fullContentDocuments = retrieval.requiredDocuments.map((document) =>
      HybridKnowledgeRetrievalResource.toRetrievalFullContentDocumentResource(knowledgeBase.projectId, document),
    )

    if (exhaustive) {
      const page = exhaustiveRetrievePage(matches)

      return { ...page, fullContentDocuments }
    }

    return { matches, fullContentDocuments, truncated: false }
  }

  private static toRetrievalMatchResource(projectId: string, match: KnowledgeBaseRetrievalMatch) {
    const chunk = HybridKnowledgeRetrievalResource.toRetrievalChunkResource(projectId, match)
    const neighboringContext = {
      prevChunk: HybridKnowledgeRetrievalResource.toNeighboringChunkResource(match.previousChunk),
      nextChunk: HybridKnowledgeRetrievalResource.toNeighboringChunkResource(match.nextChunk),
    }
    const relations = match.relations.map(HybridKnowledgeRetrievalResource.toRetrievalDocumentRelationResource)

    return {
      chunk,
      neighboringContext,
      matchType: 'hybrid' as const,
      semanticRank: match.semanticRank,
      lexicalRank: match.lexicalRank,
      rawSemanticScore: match.rawSemanticScore,
      rawLexicalScore: match.rawLexicalScore,
      relations,
      score: match.score,
      rank: match.rank,
      isMandatoryContext: match.isMandatoryContext,
    }
  }

  private static toRetrievalChunkResource(projectId: string, match: KnowledgeBaseRetrievalMatch) {
    const { chunk, document, index, revision } = match

    return {
      id: chunk.id,
      projectId,
      documentReference: document.sourcePath,
      documentTitle: revision.title,
      source: document.sourceType,
      contentVersion: `sha256:${revision.contentSha256}`,
      isEffective: match.isEffective,
      heading: chunk.headingPath.at(-1) ?? null,
      chunkIndex: chunk.ordinal,
      totalChunks: match.totalChunks,
      headingPath: chunk.headingPath,
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      indexedAt: index.readyAt!.isoString,
      chunkingStrategyId: index.chunkingProfile,
      startBlock: chunk.blockStart,
      embeddingModelId: index.embeddingModel,
      embeddingVector: chunk.embedding,
      activeDocumentIndexId: chunk.documentIndexId,
      documentRevisionId: revision.id,
      searchVector: chunk.searchVector ? [chunk.searchVector] : [],
      prevChunkReference: match.previousChunk?.id ?? null,
      nextChunkReference: match.nextChunk?.id ?? null,
    }
  }

  private static toNeighboringChunkResource(chunk: Chunk | null) {
    if (chunk === null) return null

    return {
      chunkIndex: chunk.ordinal,
      heading: chunk.headingPath.at(-1) ?? null,
      content: chunk.content,
      reference: chunk.id,
    }
  }

  private static toRetrievalDocumentRelationResource(facts: KnowledgeBaseRetrievalRelation) {
    const { relation, sourceDocument, resolution } = facts

    return {
      relationId: relation.id,
      relationType: relation.relationType,
      sourceIndexId: relation.sourceIndexId,
      sourceDocumentReference: sourceDocument.sourcePath,
      targetDocumentReference: relation.targetReference,
      targetAnchor: resolution.targetAnchor,
      targetDocumentId: resolution.targetDocumentId,
      evidenceBlockStart: relation.evidenceBlockStart,
      evidenceBlockEnd: relation.evidenceBlockEnd,
      evidenceText: relation.evidenceText,
      resolution: resolution.resolution,
      candidateCount: resolution.candidateCount,
    }
  }

  private static toRetrievalFullContentDocumentResource(projectId: string, facts: KnowledgeBaseRetrievalDocument) {
    return {
      projectId,
      documentReference: facts.document.sourcePath,
      documentTitle: facts.revision.title,
      source: facts.document.sourceType,
      contentVersion: `sha256:${facts.revision.contentSha256}`,
      documentRevisionId: facts.revision.id,
      content: facts.revision.content,
    }
  }
}
