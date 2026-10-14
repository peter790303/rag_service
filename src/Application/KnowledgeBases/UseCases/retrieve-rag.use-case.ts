import { RagRelationResolutionEnum } from '../../../Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import { KnowledgeRetrievalIncompleteException } from '../../../Domain/Knowledge/Exceptions/knowledge-retrieval-incomplete.exception.js'
import { RagDocumentReference } from '../../../Domain/Knowledge/ValueObjects/rag-document-reference.js'
import { RetrievalCandidateAssembler } from '../Assemblers/retrieval-candidate.assembler.js'
import { RetrievalContextCriteriaAssembler } from '../Assemblers/retrieval-context-criteria.assembler.js'
import { RetrievalResultAssembler } from '../Assemblers/retrieval-result.assembler.js'
import { EmbeddingProvider } from '../Contracts/embedding-provider.js'
import type { RagChunkCandidateFacts, RagChunkRepositoryPort } from '../Contracts/rag-chunk-repository.port.js'
import { RagLexicalSearchFormatter } from '../Contracts/rag-lexical-search-formatter.js'
import type { RagRetrievalProfileSettings } from '../Contracts/rag-retrieval-profile-settings.js'
import type {
  RagRetrievalScopeInput,
  RagRetrievalScopeResult,
  RagHybridRetrievalInput,
  RagHybridRetrievalResult,
  ResolvedRagRelationTarget,
  ExpansionState,
  RagRetrievalContextInput,
  RagRetrievalContextResult,
} from '../Contracts/rag-retrieval-selection.js'
import type { HybridCandidate, RagRetrievalStore, RetrievalChunk } from '../Contracts/rag-retrieval-store.js'
import type { HybridRetrieveDto, RankedCandidate } from '../DataTransferObjects/rag.dto.js'
import type {
  RetrievalFullContentDocumentView,
  RetrievalMatchView,
} from '../DataTransferObjects/retrieval-result.dto.js'
import { ensureRetrievalResultRequirements } from '../Guards/retrieval-result.guard.js'

export const RELATION_EXPANSION_MAX_DEPTH = 2
export const RELATION_CANDIDATE_LIMIT = 8
export const RELATION_TARGET_CHUNK_LIMIT = 8
export const RELATION_EXPANSION_RELATION_LIMIT = 64
export const RELATION_EXPANSION_CHUNK_LIMIT = 64

export class RetrieveRagUseCase {
  constructor(
    private readonly store: RagRetrievalStore,
    private readonly embeddings: EmbeddingProvider,
    private readonly lexicalFormatter: RagLexicalSearchFormatter,
    private readonly profiles: RagRetrievalProfileSettings,
  ) {}

  async execute(
    input: HybridRetrieveDto,
  ): Promise<{ matches: RetrievalMatchView[]; fullContentDocuments: RetrievalFullContentDocumentView[] }> {
    const queryEmbedding = input.queryVector ?? (await this.embeddings.embed([input.queryText]))[0] ?? []
    const queryEmbeddingModelId = input.queryVector ? input.embeddingModelId : this.embeddings.modelId
    const resultLimit = input.topK ?? input.limit ?? 10
    const candidateLimit = Math.min(200, Math.max(20, resultLimit * 4))
    const lexicalQuery = this.lexicalFormatter.format(input.queryText)
    const {
      snapshot,
      candidates,
      contextChunks,
      relationTargetChunks,
      selection: scope,
    } = await this.store.loadHybridSnapshot(
      {
        projectId: input.projectId,
        includeNonEffective: input.includeNonEffective ?? false,
        lexicalTerms: lexicalQuery.terms,
      },
      (snapshot) => {
        const scope = this.selectScope({
          queryEmbedding,
          queryEmbeddingModelId,
          lexicalProfileVersion: lexicalQuery.profileVersion,
          profiles: this.profiles,
          documentReference: input.documentReference,
          includeNonEffective: input.includeNonEffective ?? false,
          knowledgeBaseId: snapshot.knowledgeBaseId,
          memberships: snapshot.memberships,
          documents: snapshot.documents,
          indexes: snapshot.indexes,
          revisions: snapshot.revisions,
        })

        return {
          retrievalIndexIds: scope.retrievalIndexIds,
          relationTargetIndexIds: scope.relationTargetIndexIds,
          requiredIndexIds: scope.requiredIndexIds,
          value: scope,
        }
      },
      (chunks, scope) =>
        this.loadCandidates(chunks, scope.retrievalIndexIds, queryEmbedding, lexicalQuery.terms, candidateLimit),
      (candidates, scope) => {
        const ranking = this.rankRetrievalCandidates(candidates, scope.retrievalIndexIds, [], resultLimit)
        const rootChunkIds = new Set(ranking.fusedChunkRanking.map(({ candidate }) => candidate.id))

        return RetrievalContextCriteriaAssembler.toQueryObject(
          candidates.filter(({ chunk }) => rootChunkIds.has(chunk.id)),
        )
      },
    )
    const ranking = this.rankRetrievalCandidates(candidates, scope.retrievalIndexIds, snapshot.chunks, resultLimit)
    const relationResolutionById = this.resolveRelationTargets({
      relations: snapshot.relations,
      projectMembers: snapshot.memberships,
      eligibleTargetIndexIds: scope.relationTargetIndexIds,
      documents: snapshot.documents,
      indexes: snapshot.indexes,
      relationTargetChunks,
    })
    const expandedChunks = this.expandRelations({
      relations: snapshot.relations,
      activeIndexChunks: ranking.fusedChunkRanking.map(({ candidate }) => candidate),
      resolutionById: relationResolutionById,
      relationTargetChunks,
    })
    const context = this.selectContext({
      activeIndexIds: snapshot.memberships.flatMap((member) => member.activeDocumentIndexId ?? []),
      requiredMembers: scope.requiredMembers,
      activeIndexChunks: ranking.activeIndexChunks,
      snapshotChunks: snapshot.chunks,
      contextChunks,
      expandedChunks,
      relationTargetChunks,
      fusedChunkRanking: ranking.fusedChunkRanking,
    })

    const resultInput = {
      projectId: input.projectId,
      snapshot,
      requiredMembers: scope.requiredMembers,
      rankedChunks: context.completeChunkRanking,
      vectorRanked: ranking.vectorRanked,
      lexicalRanked: ranking.lexicalRanked,
      neighboringChunksById: context.neighboringChunksById,
      relationResolutionById,
    }

    ensureRetrievalResultRequirements(resultInput)

    return RetrievalResultAssembler.toViewModel(resultInput)
  }

  private async loadCandidates(
    chunks: RagChunkRepositoryPort,
    documentIndexIds: readonly string[],
    queryVector: readonly number[],
    terms: readonly string[],
    limit: number,
  ): Promise<HybridCandidate[]> {
    const semantic = await chunks.findSemanticCandidates({ documentIndexIds, queryVector, limit })
    const lexical = await chunks.findLexicalCandidates({ documentIndexIds, terms, limit })
    const rankFacts = (facts: RagChunkCandidateFacts) =>
      facts.scores.reduce<Map<string, { score: number; rank: number }>>((ranked, fact, index) => {
        if (!ranked.has(fact.chunkId)) ranked.set(fact.chunkId, { score: fact.score, rank: index + 1 })

        return ranked
      }, new Map())
    const semanticById = rankFacts(semantic)
    const lexicalById = rankFacts(lexical)
    const candidateIds = [...new Set([...semanticById.keys(), ...lexicalById.keys()])]
    const chunkById = new Map([...semantic.chunks, ...lexical.chunks].map((chunk) => [chunk.id, chunk]))

    return candidateIds.flatMap((id) => {
      const chunk = chunkById.get(id)

      return chunk ? [RetrievalCandidateAssembler.toDTO(chunk, semanticById.get(id), lexicalById.get(id))] : []
    })
  }

  private rankRetrievalCandidates(
    candidates: HybridCandidate[],
    activeIndexIds: string[],
    snapshotChunks: RetrievalChunk[],
    resultLimit: number,
  ): RagHybridRetrievalResult<RetrievalChunk, HybridCandidate> {
    return this.rankCandidates<RetrievalChunk, HybridCandidate>({
      activeIndexIds,
      candidates,
      snapshotChunks,
      resultLimit,
      chunkId: (chunk) => chunk.id,
      documentIndexId: (chunk) => chunk.documentIndexId,
      semanticRank: (candidate) => candidate.semanticRank,
      lexicalRank: (candidate) => candidate.lexicalRank,
    })
  }

  private selectScope<
    TMembership extends {
      documentId: string
      activeDocumentIndexId: string | null
      alwaysIncludeFullContent: boolean
    },
    TDocument extends { id: string; sourcePath: string },
    TIndex extends {
      id: string
      documentId: string
      revisionId: string
      embeddingModel: string
      embeddingDimensions: number
      lexicalProfile: string
      chunkingModel: string
      chunkingProfile: string
      embeddingProfile: string
      relationProfile: string
      readyAt: Date | null
    },
    TRevision extends { id: string; fullContent: string | null },
  >(
    input: RagRetrievalScopeInput<TMembership, TDocument, TIndex, TRevision>,
  ): RagRetrievalScopeResult<TMembership, TIndex> {
    if (!input.queryEmbedding.length || input.queryEmbedding.some((value) => !Number.isFinite(value))) {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    if (!input.knowledgeBaseId) {
      return {
        requestedMembers: [],
        activeIndexIds: [],
        retrievalIndexIds: [],
        relationTargetIndexIds: [],
        requiredIndexIds: [],
        requiredMembers: [],
        activeIndexes: [],
      }
    }

    const documentById = new Map(input.documents.map((document) => [document.id, document]))
    const requestedReference = input.documentReference ? RagDocumentReference.tryCreate(input.documentReference) : null
    const requestedMembers = input.documentReference
      ? input.memberships.filter((membership) => {
          const documentReference = RagDocumentReference.tryCreate(documentById.get(membership.documentId)?.sourcePath)

          return Boolean(requestedReference && documentReference?.refersToSameDocument(requestedReference))
        })
      : input.memberships

    if (input.documentReference && (!requestedReference || requestedMembers.length !== 1)) {
      throw new KnowledgeRetrievalIncompleteException('Document reference must identify exactly one project document')
    }

    const activeIndexIds = requestedMembers.flatMap((member) => member.activeDocumentIndexId ?? [])
    const requestedDocumentIds = new Set(requestedMembers.map((member) => member.documentId))
    const requiredMembers = input.memberships.filter((member) => member.alwaysIncludeFullContent)
    const revisionById = new Map(input.revisions.map((revision) => [revision.id, revision]))
    const indexById = new Map(input.indexes.map((index) => [index.id, index]))
    const unavailableRequiredMember = requiredMembers.some((member) => {
      const activeIndex = member.activeDocumentIndexId ? indexById.get(member.activeDocumentIndexId) : undefined
      const revision = activeIndex ? revisionById.get(activeIndex.revisionId) : undefined

      return (
        !activeIndex?.readyAt ||
        activeIndex.documentId !== member.documentId ||
        !documentById.has(member.documentId) ||
        typeof revision?.fullContent !== 'string'
      )
    })

    if (
      unavailableRequiredMember ||
      (requestedMembers.length > 0 && !activeIndexIds.length && !input.includeNonEffective)
    ) {
      throw new KnowledgeIndexPendingException()
    }

    const activeIndexIdSet = new Set(activeIndexIds)
    const requestedDocumentByActiveIndex = new Map(
      requestedMembers.flatMap((member) =>
        member.activeDocumentIndexId ? [[member.activeDocumentIndexId, member.documentId] as const] : [],
      ),
    )
    const retrievalIndexes = input.indexes.filter(
      (index) =>
        requestedDocumentIds.has(index.documentId) &&
        index.readyAt !== null &&
        (input.includeNonEffective || requestedDocumentByActiveIndex.get(index.id) === index.documentId),
    )
    const retrievalIndexIds = retrievalIndexes.map((index) => index.id)
    const projectActiveIndexIds = new Set(input.memberships.flatMap((member) => member.activeDocumentIndexId ?? []))
    const hasCompatibleProfiles = (index: TIndex): boolean =>
      index.chunkingModel === input.profiles.chunkingModel &&
      index.chunkingProfile === input.profiles.chunkingProfile &&
      index.embeddingProfile === input.profiles.embeddingProfile &&
      index.lexicalProfile === input.profiles.lexicalProfile &&
      index.relationProfile === input.profiles.relationProfile
    const projectDocumentByActiveIndex = new Map(
      input.memberships.flatMap((member) =>
        member.activeDocumentIndexId ? [[member.activeDocumentIndexId, member.documentId] as const] : [],
      ),
    )
    const relationTargetIndexIds = input.indexes
      .filter(
        (index) =>
          projectActiveIndexIds.has(index.id) &&
          index.readyAt !== null &&
          projectDocumentByActiveIndex.get(index.id) === index.documentId &&
          index.embeddingModel === input.queryEmbeddingModelId &&
          index.embeddingDimensions === input.queryEmbedding.length &&
          hasCompatibleProfiles(index),
      )
      .map((index) => index.id)
    const requiredIndexIds = [...new Set(requiredMembers.flatMap((member) => member.activeDocumentIndexId ?? []))]

    if (requestedMembers.length > 0 && !retrievalIndexIds.length && !input.includeNonEffective) {
      throw new KnowledgeIndexPendingException()
    }

    const activeIndexes = input.indexes.filter(
      (index) =>
        activeIndexIdSet.has(index.id) &&
        requestedDocumentByActiveIndex.get(index.id) === index.documentId &&
        index.readyAt !== null,
    )
    const unsupportedIndex = retrievalIndexes.some(
      (index) =>
        index.embeddingModel !== input.queryEmbeddingModelId ||
        index.lexicalProfile !== input.lexicalProfileVersion ||
        index.embeddingDimensions !== input.queryEmbedding.length ||
        !hasCompatibleProfiles(index),
    )

    if (unsupportedIndex) throw new KnowledgeEmbeddingUnavailableException()

    return {
      requestedMembers,
      activeIndexIds,
      retrievalIndexIds,
      relationTargetIndexIds,
      requiredIndexIds,
      requiredMembers,
      activeIndexes,
    }
  }

  private rankCandidates<TChunk, TCandidate extends { chunk: TChunk }>(
    input: RagHybridRetrievalInput<TChunk, TCandidate>,
  ): RagHybridRetrievalResult<TChunk, TCandidate> {
    const activeIndexIds = new Set(input.activeIndexIds)
    const scopedCandidates = [
      ...new Map(
        input.candidates
          .filter((candidate) => activeIndexIds.has(input.documentIndexId(candidate.chunk)))
          .map((candidate) => [input.chunkId(candidate.chunk), candidate]),
      ).values(),
    ]
    const vectorRanked = scopedCandidates
      .filter((candidate) => input.semanticRank(candidate) !== null)
      .sort((left, right) => (input.semanticRank(left) ?? Infinity) - (input.semanticRank(right) ?? Infinity))
    const lexicalRanked = scopedCandidates
      .filter((candidate) => input.lexicalRank(candidate) !== null)
      .sort((left, right) => (input.lexicalRank(left) ?? Infinity) - (input.lexicalRank(right) ?? Infinity))
    const activeIndexChunks = [
      ...new Map(
        [...input.snapshotChunks, ...scopedCandidates.map(({ chunk }) => chunk)].map((chunk) => [
          input.chunkId(chunk),
          chunk,
        ]),
      ).values(),
    ].filter((chunk) => activeIndexIds.has(input.documentIndexId(chunk)))
    const fusedChunkRanking = this.reciprocalRankFusion(
      [vectorRanked.map(({ chunk }) => chunk), lexicalRanked.map(({ chunk }) => chunk)],
      input.chunkId,
      input.resultLimit,
    )

    return { scopedCandidates, vectorRanked, lexicalRanked, activeIndexChunks, fusedChunkRanking }
  }

  private reciprocalRankFusion<T>(
    rankedLists: ReadonlyArray<ReadonlyArray<T>>,
    keyOf: (candidate: T) => string,
    limit: number,
    rankOffset = 60,
  ): RankedCandidate<T>[] {
    const fused = rankedLists
      .flatMap((rankedList) => rankedList.map((candidate, position) => ({ candidate, position })))
      .reduce<Map<string, { candidate: T; score: number; firstSeen: number }>>(
        (fusedCandidatesByKey, rankedEntry, sequence) => {
          const candidateKey = keyOf(rankedEntry.candidate)
          const existingFusedCandidate = fusedCandidatesByKey.get(candidateKey)

          if (existingFusedCandidate) existingFusedCandidate.score += 1 / (rankOffset + rankedEntry.position + 1)
          else
            fusedCandidatesByKey.set(candidateKey, {
              candidate: rankedEntry.candidate,
              score: 1 / (rankOffset + rankedEntry.position + 1),
              firstSeen: sequence,
            })

          return fusedCandidatesByKey
        },
        new Map(),
      )

    return [...fused.values()]
      .sort(
        (leftCandidate, rightCandidate) =>
          rightCandidate.score - leftCandidate.score || leftCandidate.firstSeen - rightCandidate.firstSeen,
      )
      .slice(0, Math.max(0, limit))
      .map(({ candidate, score }, index) => ({ candidate, score, rank: index + 1 }))
  }

  private resolveRelationTargets<
    TRelation extends {
      id: string
      sourceIndexId: string
      targetReference: string
      targetAnchor: string | null
      relationType: string
    },
    TMembership extends { documentId: string; activeDocumentIndexId: string | null },
    TDocument extends { id: string; sourcePath: string },
    TIndex extends { id: string; documentId: string; readyAt: Date | null },
    TChunk extends { documentIndexId: string; headingPath: string[] },
  >(input: {
    relations: TRelation[]
    projectMembers: TMembership[]
    eligibleTargetIndexIds: readonly string[]
    documents: TDocument[]
    indexes: TIndex[]
    relationTargetChunks: TChunk[]
  }): Map<string, ResolvedRagRelationTarget<TRelation['relationType']>> {
    const documentById = new Map(input.documents.map((document) => [document.id, document]))
    const indexById = new Map(input.indexes.map((index) => [index.id, index]))
    const eligibleTargetIndexIds = new Set(input.eligibleTargetIndexIds)

    return new Map(
      input.relations.map((relation): [string, ResolvedRagRelationTarget<TRelation['relationType']>] => {
        const sourceIndex = indexById.get(relation.sourceIndexId)
        const sourceDocument = sourceIndex ? documentById.get(sourceIndex.documentId) : undefined
        const targetPath = this.resolveTargetPath(
          relation.targetReference,
          sourceDocument?.sourcePath ?? '',
          relation.relationType as 'markdown_link' | 'wiki_link',
        )
        const targetAnchor = this.resolveTargetAnchor(relation.targetAnchor, relation.targetReference)
        const targetReference = sourceDocument ? RagDocumentReference.tryCreate(targetPath, targetAnchor) : null
        const readyTargets = input.projectMembers.flatMap((member) => {
          if (!member.activeDocumentIndexId) return []

          const document = documentById.get(member.documentId)
          const index = indexById.get(member.activeDocumentIndexId)
          const reference = RagDocumentReference.tryCreate(document?.sourcePath)

          return document &&
            index?.readyAt &&
            index.documentId === member.documentId &&
            eligibleTargetIndexIds.has(index.id) &&
            reference
            ? [
                {
                  document,
                  index,
                  reference,
                },
              ]
            : []
        })
        const exactTargets = targetReference
          ? readyTargets.filter((target) => target.reference.refersToSameDocument(targetReference))
          : []
        const matchingTargets =
          exactTargets.length > 0 || relation.relationType !== 'wiki_link' || !targetReference
            ? exactTargets
            : readyTargets.filter((target) => target.reference.path.endsWith(`/${targetReference.path}`))
        const uniqueTarget = matchingTargets.length === 1 ? matchingTargets[0] : undefined
        const anchorChunks = uniqueTarget
          ? input.relationTargetChunks.filter(
              (chunk) =>
                chunk.documentIndexId === uniqueTarget.index.id &&
                targetReference?.matchesHeadingPath(chunk.headingPath) === true,
            )
          : []
        const anchorMissing = Boolean(uniqueTarget && targetAnchor && anchorChunks.length === 0)
        const targetDocumentId = uniqueTarget?.document.id ?? null
        const targetIndexId = uniqueTarget && !anchorMissing ? uniqueTarget.index.id : null
        const resolution =
          targetDocumentId && !anchorMissing
            ? RagRelationResolutionEnum.RESOLVED
            : matchingTargets.length > 1
              ? RagRelationResolutionEnum.AMBIGUOUS
              : RagRelationResolutionEnum.MISSING

        return [
          relation.id,
          {
            targetDocumentId,
            targetAnchor,
            targetReference,
            targetIndexId,
            candidateCount: matchingTargets.length,
            resolution,
            relationType: relation.relationType,
          },
        ]
      }),
    )
  }

  private resolveTargetPath(
    reference: string,
    sourcePath: string,
    relationType: 'markdown_link' | 'wiki_link',
  ): string {
    if (/^[a-z][a-z\d+.-]*:/i.test(reference.trim())) return ''

    const targetPath = reference.split('|', 1)[0]?.split('#', 1)[0]?.trim().replaceAll('\\', '/') ?? ''

    if (!targetPath) return sourcePath

    if (relationType === 'wiki_link') return targetPath.startsWith('/') ? targetPath.slice(1) : targetPath

    return targetPath.startsWith('/')
      ? targetPath.slice(1)
      : `${sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : ''}/${targetPath}`
  }

  private resolveTargetAnchor(targetAnchor: string | null, targetReference: string): string | null {
    const explicitAnchor = targetAnchor?.trim()

    if (explicitAnchor) return explicitAnchor

    const referencePath = targetReference.split('|', 1)[0] ?? targetReference
    const anchorSeparator = referencePath.indexOf('#')

    if (anchorSeparator < 0) return null

    return referencePath.slice(anchorSeparator + 1).trim() || null
  }

  private expandRelations<
    TRelation extends {
      id: string
      sourceIndexId: string
      evidenceBlockStart: number
      evidenceBlockEnd: number
    },
    TResolution extends {
      targetIndexId: string | null
      targetReference: RagDocumentReference | null
    },
    TChunk extends { id: string; documentIndexId: string; headingPath: string[]; blockStart: number; blockEnd: number },
  >(input: {
    relations: TRelation[]
    activeIndexChunks: TChunk[]
    resolutionById: Map<string, TResolution>
    relationTargetChunks: TChunk[]
  }): TChunk[] {
    const relationsBySourceIndex = input.relations.reduce((groups, relation) => {
      const group = groups.get(relation.sourceIndexId) ?? []
      groups.set(relation.sourceIndexId, [...group, relation])

      return groups
    }, new Map<string, TRelation[]>())
    const initialState: ExpansionState<TChunk> = {
      expandedIndexIds: new Set(),
      expandedChunkIds: new Set(input.activeIndexChunks.map((chunk) => chunk.id)),
      chunks: [],
      processedRelationCount: 0,
    }
    const sourceIndexIds = [...new Set(input.activeIndexChunks.map((chunk) => chunk.documentIndexId))].slice(
      0,
      RELATION_EXPANSION_RELATION_LIMIT,
    )

    const sourceRelationsFor = (sourceIndexId: string, evidenceChunks: TChunk[], state: ExpansionState<TChunk>) => {
      if (
        state.processedRelationCount >= RELATION_EXPANSION_RELATION_LIMIT ||
        state.chunks.length >= RELATION_EXPANSION_CHUNK_LIMIT
      ) {
        return []
      }

      return (relationsBySourceIndex.get(sourceIndexId) ?? [])
        .filter((relation) =>
          evidenceChunks.some(
            (chunk) => chunk.blockStart <= relation.evidenceBlockEnd && chunk.blockEnd >= relation.evidenceBlockStart,
          ),
        )
        .slice(0, RELATION_EXPANSION_RELATION_LIMIT - state.processedRelationCount)
    }
    const expandTarget = (
      state: ExpansionState<TChunk>,
      relation: TRelation,
      visitedIndexIds: Set<string>,
    ): { state: ExpansionState<TChunk>; targetIndexId: string | null; matchingChunks: TChunk[] } => {
      if (
        state.processedRelationCount >= RELATION_EXPANSION_RELATION_LIMIT ||
        state.chunks.length >= RELATION_EXPANSION_CHUNK_LIMIT
      ) {
        return { state, targetIndexId: null, matchingChunks: [] }
      }

      const relationState: ExpansionState<TChunk> = {
        ...state,
        processedRelationCount: state.processedRelationCount + 1,
      }
      const resolution = input.resolutionById.get(relation.id)
      const targetIndexId = resolution?.targetIndexId
      const skipped = { state: relationState, targetIndexId: null, matchingChunks: [] }

      if (!targetIndexId || visitedIndexIds.has(targetIndexId)) return skipped

      if (
        relationState.expandedIndexIds.size >= RELATION_CANDIDATE_LIMIT &&
        !relationState.expandedIndexIds.has(targetIndexId)
      ) {
        return skipped
      }

      const targetReference = resolution?.targetReference
      const matchingChunks = input.relationTargetChunks
        .filter(
          (chunk) =>
            chunk.documentIndexId === targetIndexId &&
            !relationState.expandedChunkIds.has(chunk.id) &&
            (!targetReference || targetReference.matchesHeadingPath(chunk.headingPath)),
        )
        .slice(0, Math.min(RELATION_TARGET_CHUNK_LIMIT, RELATION_EXPANSION_CHUNK_LIMIT - relationState.chunks.length))

      if (!matchingChunks.length) return skipped

      return {
        state: {
          expandedIndexIds: new Set([...relationState.expandedIndexIds, targetIndexId]),
          expandedChunkIds: new Set([...relationState.expandedChunkIds, ...matchingChunks.map((chunk) => chunk.id)]),
          chunks: [...relationState.chunks, ...matchingChunks],
          processedRelationCount: relationState.processedRelationCount,
        },
        targetIndexId,
        matchingChunks,
      }
    }

    // Two explicit hops preserve depth-first ordering without recursive traversal.
    return sourceIndexIds.reduce((state, sourceIndexId) => {
      const visitedIndexIds = new Set([sourceIndexId])
      const evidenceChunks = input.activeIndexChunks.filter((chunk) => chunk.documentIndexId === sourceIndexId)

      return sourceRelationsFor(sourceIndexId, evidenceChunks, state).reduce((currentState, relation) => {
        const firstHop = expandTarget(currentState, relation, visitedIndexIds)

        if (!firstHop.targetIndexId || RELATION_EXPANSION_MAX_DEPTH < 2) return firstHop.state

        const nextVisitedIndexIds = new Set([...visitedIndexIds, firstHop.targetIndexId])

        return sourceRelationsFor(firstHop.targetIndexId, firstHop.matchingChunks, firstHop.state).reduce(
          (nextState, nextRelation) => expandTarget(nextState, nextRelation, nextVisitedIndexIds).state,
          firstHop.state,
        )
      }, state)
    }, initialState).chunks
  }

  private selectContext<
    TChunk extends { id: string; documentIndexId: string; ordinal: number },
    TMember extends { activeDocumentIndexId: string | null },
  >(input: RagRetrievalContextInput<TChunk, TMember>): RagRetrievalContextResult<TChunk> {
    const activeIndexIds = new Set(input.activeIndexIds)
    const requiredIndexIds = new Set(
      input.requiredMembers.flatMap((member) => (member.activeDocumentIndexId ? [member.activeDocumentIndexId] : [])),
    )
    const mandatoryChunks = input.activeIndexChunks.filter((chunk) => requiredIndexIds.has(chunk.documentIndexId))
    const requiredChunks = input.snapshotChunks.filter((chunk) => requiredIndexIds.has(chunk.documentIndexId))
    const allMandatoryChunks = this.uniqueChunks([...mandatoryChunks, ...requiredChunks])
    const supplementalChunks = this.uniqueChunks([...allMandatoryChunks, ...input.expandedChunks])
    const rankedChunkIds = new Set(input.fusedChunkRanking.map(({ candidate }) => candidate.id))
    const completeChunkRanking = input.fusedChunkRanking.concat(
      supplementalChunks
        .filter((chunk) => !rankedChunkIds.has(chunk.id))
        .map((candidate, index) => ({
          candidate,
          score: 0,
          rank: input.fusedChunkRanking.length + index + 1,
        })),
    )
    const mandatoryChunkIds = new Set(allMandatoryChunks.map((chunk) => chunk.id))
    const classifiedChunkRanking = completeChunkRanking.map((ranked) => ({
      ...ranked,
      isEffective: activeIndexIds.has(ranked.candidate.documentIndexId),
      isMandatoryContext: mandatoryChunkIds.has(ranked.candidate.id),
    }))

    const availableContextChunks = this.uniqueChunks([
      ...input.contextChunks,
      ...requiredChunks,
      ...input.expandedChunks,
    ])
    const neighboringSourceChunks = this.uniqueChunks([
      ...availableContextChunks,
      ...completeChunkRanking.map(({ candidate }) => candidate),
      ...input.relationTargetChunks,
    ])
    const chunksByIndexAndOrdinal = neighboringSourceChunks.reduce((grouped, chunk) => {
      const chunksByOrdinal = grouped.get(chunk.documentIndexId) ?? new Map<number, TChunk>()
      chunksByOrdinal.set(chunk.ordinal, chunk)
      grouped.set(chunk.documentIndexId, chunksByOrdinal)

      return grouped
    }, new Map<string, Map<number, TChunk>>())
    const neighboringChunksById = new Map(
      completeChunkRanking.map(({ candidate }) => {
        const chunksByOrdinal = chunksByIndexAndOrdinal.get(candidate.documentIndexId)

        return [
          candidate.id,
          {
            previousChunk: chunksByOrdinal?.get(candidate.ordinal - 1) ?? null,
            nextChunk: chunksByOrdinal?.get(candidate.ordinal + 1) ?? null,
          },
        ] as const
      }),
    )

    return {
      availableContextChunks,
      mandatoryChunks: allMandatoryChunks,
      completeChunkRanking: classifiedChunkRanking,
      neighboringChunksById,
    }
  }

  private uniqueChunks<TChunk extends { id: string }>(chunks: TChunk[]): TChunk[] {
    return [...new Map(chunks.map((chunk) => [chunk.id, chunk])).values()]
  }
}
