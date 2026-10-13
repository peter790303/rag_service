import { RagRelationResolutionEnum } from '../../../Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { HybridRanker } from '../../../Domain/Knowledge/ValueObjects/hybrid-ranking.js'
import { LEXICAL_PROFILE_VERSION } from '../../../Domain/Knowledge/ValueObjects/lexical-profile.js'
export { LEXICAL_PROFILE_VERSION } from '../../../Domain/Knowledge/ValueObjects/lexical-profile.js'
import { RagRetrievalStore } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-retrieval-store.js'
import {
  normalizeDocumentPath,
  normalizeReference,
  RetrievalResultAssembler,
  type RetrievalFullContentDocumentView,
  type RetrievalMatchView,
} from '../Assemblers/retrieval-result.assembler.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'
import type { HybridRetrieveDto } from '../DataTransferObjects/rag.dto.js'

export const RELATION_EXPANSION_MAX_DEPTH = 2
export const RELATION_CANDIDATE_LIMIT = 8

export class RetrieveRagUseCase {
  constructor(
    private readonly store: RagRetrievalStore,
    private readonly embeddings: EmbeddingProvider,
  ) {}

  async execute(
    input: HybridRetrieveDto,
  ): Promise<{ matches: RetrievalMatchView[]; fullContentDocuments: RetrievalFullContentDocumentView[] }> {
    const queryEmbedding = input.queryVector ?? (await this.embeddings.embed([input.queryText]))[0] ?? []

    if (queryEmbedding.length === 0) throw new KnowledgeEmbeddingUnavailableException()

    const resultLimit = input.topK ?? input.limit ?? 10
    const candidateLimit = Math.min(200, Math.max(20, resultLimit * 4))
    const { snapshot, candidates, contextChunks, relationTargetChunks } = await this.store.loadHybridSnapshot(
      input,
      queryEmbedding,
      {
        vectorLimit: candidateLimit,
        lexicalLimit: candidateLimit,
      },
    )

    if (!snapshot.knowledgeBaseId) return { matches: [], fullContentDocuments: [] }

    const documentById = new Map(snapshot.documents.map((document) => [document.id, document]))
    const requestedMembers = input.documentReference
      ? snapshot.memberships.filter(
          (membership) =>
            normalizeDocumentPath(documentById.get(membership.documentId)?.sourcePath ?? '') ===
            normalizeDocumentPath(input.documentReference ?? ''),
        )
      : snapshot.memberships

    if (input.documentReference && requestedMembers.length === 0) return { matches: [], fullContentDocuments: [] }

    const activeIndexIds = requestedMembers.flatMap((member) => member.activeDocumentIndexId ?? [])
    const requiredMembers = requestedMembers.filter((member) => member.alwaysIncludeFullContent)
    const unavailableRequiredMember = requiredMembers.some((member) => {
      const activeIndex = member.activeDocumentIndexId
        ? snapshot.indexes.find((index) => index.id === member.activeDocumentIndexId)
        : undefined
      const revision = activeIndex
        ? snapshot.revisions.find((candidate) => candidate.id === activeIndex.revisionId)
        : undefined

      return !activeIndex?.readyAt || typeof revision?.fullContent !== 'string'
    })

    if (unavailableRequiredMember || (!activeIndexIds.length && !input.includeNonEffective))
      throw new KnowledgeIndexPendingException()

    const activeIndexes = snapshot.indexes.filter((index) => activeIndexIds.includes(index.id))
    const queryEmbeddingModelId = input.queryVector ? input.embeddingModelId : this.embeddings.modelId

    if (
      activeIndexes.some(
        (index) => index.embeddingModel !== queryEmbeddingModelId || index.lexicalProfile !== LEXICAL_PROFILE_VERSION,
      )
    )
      throw new KnowledgeEmbeddingUnavailableException()

    if (activeIndexes.some((index) => index.embeddingDimensions !== queryEmbedding.length))
      throw new KnowledgeEmbeddingUnavailableException()

    const scopedCandidates = candidates.filter((candidate) => activeIndexIds.includes(candidate.chunk.documentIndexId))
    const vectorRanked = scopedCandidates
      .filter((candidate) => candidate.semanticRank !== null)
      .sort((left, right) => (left.semanticRank ?? Infinity) - (right.semanticRank ?? Infinity))
    const lexicalRanked = scopedCandidates
      .filter((candidate) => candidate.lexicalRank !== null)
      .sort((left, right) => (left.lexicalRank ?? Infinity) - (right.lexicalRank ?? Infinity))
    const activeIndexChunks = [
      ...new Map(
        [...snapshot.chunks, ...scopedCandidates.map(({ chunk }) => chunk)].map((chunk) => [chunk.id, chunk]),
      ).values(),
    ].filter((chunk) => activeIndexIds.includes(chunk.documentIndexId))
    const fusedChunkRanking = HybridRanker.reciprocalRankFusion(
      [vectorRanked.map(({ chunk }) => chunk), lexicalRanked.map(({ chunk }) => chunk)],
      (chunk) => chunk.id,
      resultLimit,
    )
    const indexById = new Map(snapshot.indexes.map((index) => [index.id, index]))
    const mandatoryDocumentIds = new Set(requiredMembers.map((member) => member.documentId))
    const entryIndexIds = new Set(
      requestedMembers.flatMap((member) =>
        member.isEntry && member.activeDocumentIndexId ? [member.activeDocumentIndexId] : [],
      ),
    )
    const mandatoryChunks = activeIndexChunks.filter((chunk) => {
      const index = snapshot.indexes.find((candidate) => candidate.id === chunk.documentIndexId)

      return mandatoryDocumentIds.has(index?.documentId ?? '') || entryIndexIds.has(chunk.documentIndexId)
    })
    const relationResolutionById = new Map(
      snapshot.relations.map((relation) => {
        const sourceIndex = indexById.get(relation.sourceIndexId)
        const sourceDocument = sourceIndex ? documentById.get(sourceIndex.documentId) : undefined
        const referencePath = normalizeReference(relation.targetReference, sourceDocument?.sourcePath ?? '')
        const matchingTargetDocuments = requestedMembers
          .filter((member) => member.activeDocumentIndexId !== null)
          .flatMap((member) => {
            const targetDocument = documentById.get(member.documentId)
            const targetIndex = member.activeDocumentIndexId ? indexById.get(member.activeDocumentIndexId) : undefined

            if (!targetDocument || !targetIndex?.readyAt) return []

            return normalizeDocumentPath(targetDocument.sourcePath) === referencePath
              ? [{ document: targetDocument, index: targetIndex }]
              : []
          })
        const uniqueTarget = matchingTargetDocuments.length === 1 ? matchingTargetDocuments[0] : undefined
        const targetDocumentId = uniqueTarget?.document.id ?? null
        const relationAnchor = getRelationAnchor(relation.targetAnchor, relation.targetReference)
        const anchorChunks = uniqueTarget
          ? selectRelationAnchorChunks(
              relationTargetChunks.filter((chunk) => chunk.documentIndexId === uniqueTarget.index.id),
              relationAnchor,
            )
          : []
        const anchorMissing = Boolean(uniqueTarget && relationAnchor && anchorChunks.length === 0)
        const targetIndexId = uniqueTarget && !anchorMissing ? uniqueTarget.index.id : null
        const resolution =
          targetDocumentId && !anchorMissing
            ? RagRelationResolutionEnum.RESOLVED
            : matchingTargetDocuments.length > 1
              ? RagRelationResolutionEnum.AMBIGUOUS
              : RagRelationResolutionEnum.MISSING

        return [
          relation.id,
          {
            targetDocumentId,
            targetAnchor: relationAnchor,
            targetIndexId,
            candidateCount: matchingTargetDocuments.length,
            resolution,
            relationType: relation.relationType,
          },
        ] as const
      }),
    )
    const expandedIndexIds = new Set<string>()
    const expandedChunkIds = new Set<string>()
    const expandedChunks: typeof relationTargetChunks = []
    const expandRelations = (sourceIndexId: string, depth: number, visitedIndexIds: Set<string>): void => {
      if (depth >= RELATION_EXPANSION_MAX_DEPTH) return

      for (const relation of snapshot.relations.filter((candidate) => candidate.sourceIndexId === sourceIndexId)) {
        const resolution = relationResolutionById.get(relation.id)
        const targetIndexId = resolution?.targetIndexId

        if (!targetIndexId || visitedIndexIds.has(targetIndexId)) continue

        if (expandedIndexIds.size >= RELATION_CANDIDATE_LIMIT && !expandedIndexIds.has(targetIndexId)) continue

        const targetChunks = relationTargetChunks.filter((chunk) => chunk.documentIndexId === targetIndexId)
        const anchoredChunks = selectRelationAnchorChunks(
          targetChunks,
          getRelationAnchor(relation.targetAnchor, relation.targetReference),
        )

        if (anchoredChunks.length === 0) continue

        expandedIndexIds.add(targetIndexId)

        for (const chunk of anchoredChunks) {
          if (expandedChunkIds.has(chunk.id)) continue

          expandedChunkIds.add(chunk.id)
          expandedChunks.push(chunk)
        }

        const nextVisitedIndexIds = new Set(visitedIndexIds)
        nextVisitedIndexIds.add(targetIndexId)
        expandRelations(targetIndexId, depth + 1, nextVisitedIndexIds)
      }
    }

    const sourceIndexIds = new Set(activeIndexChunks.map((chunk) => chunk.documentIndexId))

    for (const sourceIndexId of sourceIndexIds) {
      expandRelations(sourceIndexId, 0, new Set([sourceIndexId]))
    }
    const requiredIndexIds = requiredMembers.flatMap((member) => member.activeDocumentIndexId ?? [])
    const requiredChunks = snapshot.chunks.filter((chunk) => requiredIndexIds.includes(chunk.documentIndexId))
    const availableContextChunks = [
      ...new Map([...contextChunks, ...requiredChunks, ...expandedChunks].map((chunk) => [chunk.id, chunk])).values(),
    ]
    const allMandatoryChunks = [
      ...new Map([...mandatoryChunks, ...requiredChunks].map((chunk) => [chunk.id, chunk])).values(),
    ]
    const supplementalChunks = [
      ...new Map([...allMandatoryChunks, ...expandedChunks].map((chunk) => [chunk.id, chunk])).values(),
    ]
    const rankedChunkIds = new Set(fusedChunkRanking.map(({ candidate }) => candidate.id))
    const completeChunkRanking = fusedChunkRanking.concat(
      supplementalChunks
        .filter((chunk) => !rankedChunkIds.has(chunk.id))
        .map((candidate, index) => ({ candidate, score: 0, rank: fusedChunkRanking.length + index + 1 })),
    )

    return RetrievalResultAssembler.assemble({
      projectId: input.projectId,
      snapshot,
      requestedMembers,
      rankedChunks: completeChunkRanking,
      vectorRanked,
      lexicalRanked,
      contextChunks: availableContextChunks,
      mandatoryChunks: allMandatoryChunks,
      relationResolutionById,
    })
  }
}

const selectRelationAnchorChunks = <TChunk extends { headingPath: string[] }>(
  chunks: TChunk[],
  targetAnchor: string | null,
): TChunk[] => {
  if (!targetAnchor) return chunks

  const anchor = normalizeAnchor(targetAnchor)

  return chunks.filter((chunk) => chunk.headingPath.some((heading) => normalizeAnchor(heading) === anchor))
}

const normalizeAnchor = (value: string): string => {
  let decodedValue = value

  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    // Keep the original anchor if the source contains malformed percent escapes.
  }

  return decodedValue
    .replace(/^#+/, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
}

const getRelationAnchor = (targetAnchor: string | null, targetReference: string): string | null => {
  const explicitAnchor = targetAnchor?.trim()

  if (explicitAnchor) return explicitAnchor

  const referencePath = targetReference.split('|', 1)[0] ?? targetReference
  const anchorSeparator = referencePath.indexOf('#')

  if (anchorSeparator < 0) return null

  const anchor = referencePath.slice(anchorSeparator + 1).trim()

  return anchor || null
}
