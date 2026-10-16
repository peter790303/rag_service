import type { DateTime } from '../../../Domain/Document/ValueObjects/date-time.ts'
import { KnowledgeIndexPendingException } from '../../../Domain/DocumentIndex/Exceptions/knowledge-index-pending.exception.ts'
import { DocumentRelationResolutionEnum } from '../../../Domain/DocumentRelation/Enums/document-relation-resolution.enum.ts'
import { DocumentRelationTypeEnum } from '../../../Domain/DocumentRelation/Enums/document-relation-type.enum.ts'
import { DocumentReference } from '../../../Domain/DocumentRelation/ValueObjects/document-reference.ts'
import { DocumentReferenceResolutionAmbiguousException } from '../../../Domain/KnowledgeBase/Exceptions/document-reference-resolution-ambiguous.exception.ts'
import { RequiredDocumentActiveIndexMismatchException } from '../../../Domain/KnowledgeBase/Exceptions/required-document-active-index-mismatch.exception.ts'
import { RequiredDocumentActiveIndexMissingException } from '../../../Domain/KnowledgeBase/Exceptions/required-document-active-index-missing.exception.ts'
import { RequiredDocumentFullContentMissingException } from '../../../Domain/KnowledgeBase/Exceptions/required-document-full-content-missing.exception.ts'
import { RetrievalDocumentMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-document-missing.exception.ts'
import { RetrievalExactChunkCountMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-exact-chunk-count-missing.exception.ts'
import { RetrievalReadyIndexMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-ready-index-missing.exception.ts'
import { RetrievalRelationResolutionMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-relation-resolution-missing.exception.ts'
import { RetrievalRelationSourceDocumentMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-relation-source-document-missing.exception.ts'
import { RetrievalRelationSourceIndexMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-relation-source-index-missing.exception.ts'
import { RetrievalRevisionIdentityMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-revision-identity-missing.exception.ts'
import { RetrievalRevisionMissingException } from '../../../Domain/KnowledgeBase/Exceptions/retrieval-revision-missing.exception.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { FindRetrievalChunkCandidatesUseCaseContract } from '../../Chunks/Contracts/find-retrieval-chunk-candidates.use-case.contract.ts'
import type { LoadRetrievalChunkContextUseCaseContract } from '../../Chunks/Contracts/load-retrieval-chunk-context.use-case.contract.ts'
import type { LoadRetrievalIndexChunksUseCaseContract } from '../../Chunks/Contracts/load-retrieval-index-chunks.use-case.contract.ts'
import type { LoadRetrievalDocumentIndexesUseCaseContract } from '../../DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import type { LoadRetrievalDocumentRelationsUseCaseContract } from '../../DocumentRelations/Contracts/load-retrieval-document-relations.use-case.contract.ts'
import type { LoadRetrievalDocumentRevisionsUseCaseContract } from '../../DocumentRevisions/Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import type { LoadRetrievalDocumentsUseCaseContract } from '../../Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import type { LoadRetrievalMembershipsUseCaseContract } from '../../Memberships/Contracts/load-retrieval-memberships.use-case.contract.ts'
import { RetrievalKnowledgeBaseChunkAssembler } from '../Assemblers/retrieval-knowledge-base-chunk.assembler.ts'
import {
  RetrievalKnowledgeBaseContentAssembler,
  type RetrievalKnowledgeBaseContentAssemblerInput,
} from '../Assemblers/retrieval-knowledge-base-content.assembler.ts'
import { RetrievalSnapshotKnowledgeBaseAssembler } from '../Assemblers/retrieval-snapshot-knowledge-base.assembler.ts'
import { EmbeddingProvider } from '../Contracts/embedding-provider.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../Contracts/persistence-transaction.ts'
import type { HybridRetrieveDto } from '../DataTransferObjects/hybrid-retrieve.dto.ts'
import type { RetrievalProfileSettingsDto } from '../DataTransferObjects/retrieval-profile-settings.dto.ts'
import { KnowledgeEmbeddingUnavailableException } from '../Exceptions/knowledge-embedding-unavailable.exception.ts'
import type { RankedCandidate } from '../Types/ranked-candidate.ts'
import type { HybridChunkCandidate, RetrievalChunk } from '../Types/retrieval-chunk.ts'
import type {
  RetrievalContextInput,
  RetrievalContextSelection,
  HybridRetrievalInput,
  HybridRetrievalRanking,
  RetrievalScopeInput,
  RetrievalScopeSelection,
  ResolvedDocumentRelationTarget,
  RetrievalExpansionState,
} from '../Types/retrieval-selection.ts'
import type { RetrievalSnapshot } from '../Types/retrieval-snapshot.ts'

export const RELATION_EXPANSION_MAX_DEPTH = 2
export const RELATION_CANDIDATE_LIMIT = 8
export const RELATION_TARGET_CHUNK_LIMIT = 8
export const RELATION_EXPANSION_RELATION_LIMIT = 64
export const RELATION_EXPANSION_CHUNK_LIMIT = 64

export class RetrieveKnowledgeBaseContentUseCase {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly knowledgeBaseRepository: KnowledgeBaseRepository,
    private readonly loadRetrievalMemberships: LoadRetrievalMembershipsUseCaseContract,
    private readonly loadRetrievalDocuments: LoadRetrievalDocumentsUseCaseContract,
    private readonly loadRetrievalDocumentIndexes: LoadRetrievalDocumentIndexesUseCaseContract,
    private readonly loadRetrievalDocumentRevisions: LoadRetrievalDocumentRevisionsUseCaseContract,
    private readonly loadRetrievalIndexChunks: LoadRetrievalIndexChunksUseCaseContract,
    private readonly loadRetrievalDocumentRelations: LoadRetrievalDocumentRelationsUseCaseContract,
    private readonly findRetrievalChunkCandidates: FindRetrievalChunkCandidatesUseCaseContract,
    private readonly loadRetrievalChunkContext: LoadRetrievalChunkContextUseCaseContract,
    private readonly embeddingProvider: EmbeddingProvider,
    private readonly retrievalProfiles: RetrievalProfileSettingsDto,
  ) {}

  async execute(retrievalRequest: HybridRetrieveDto): Promise<KnowledgeBase | null> {
    const queryEmbedding =
      retrievalRequest.queryVector ?? (await this.embeddingProvider.embed([retrievalRequest.queryText]))[0] ?? []
    const queryEmbeddingModelId = retrievalRequest.queryVector
      ? retrievalRequest.embeddingModelId
      : this.embeddingProvider.modelId
    const retrievalMatchLimit = retrievalRequest.topK ?? retrievalRequest.limit ?? 10
    const candidateLimit = Math.min(200, Math.max(20, retrievalMatchLimit * 4))
    const {
      snapshot,
      candidates,
      contextChunks,
      relationTargetChunks,
      chunkCountsByDocumentIndexId,
      selection: scope,
    } = await this.persistenceTransaction.runReadOnlySnapshot(async () => {
      const facts = await this.loadSnapshotFacts(retrievalRequest.projectId)
      const scope = this.selectScope({
        queryEmbedding,
        queryEmbeddingModelId,
        lexicalProfileVersion: this.retrievalProfiles.lexicalProfile,
        profiles: this.retrievalProfiles,
        documentReference: retrievalRequest.documentReference,
        includeNonEffective: retrievalRequest.includeNonEffective ?? false,
        knowledgeBaseId: facts.knowledgeBaseId,
        memberships: facts.memberships,
        documents: facts.documents,
        indexes: facts.indexes,
        revisions: facts.revisions,
      })
      const candidateChunks = await this.findRetrievalChunkCandidates.execute({
        documentIndexIds: scope.retrievalIndexIds,
        queryVector: queryEmbedding,
        queryText: retrievalRequest.queryText,
        limit: candidateLimit,
      })
      const candidates = RetrievalKnowledgeBaseChunkAssembler.toHybridChunkCandidates(candidateChunks)
      const ranking = this.rankRetrievalCandidates(candidates, scope.retrievalIndexIds, [], retrievalMatchLimit)
      const neighboringChunks = await this.loadRetrievalChunkContext.execute({
        candidates: candidateChunks,
        rootChunkIds: ranking.fusedChunkRanking.map(({ candidate }) => candidate.id),
        activeDocumentIndexIds: scope.retrievalIndexIds,
      })
      const fullContentIndexIds = [...scope.requiredIndexIds, ...scope.relationTargetIndexIds]
      const indexChunks = await this.loadRetrievalIndexChunks.execute({
        fullContentIndexIds,
        countedIndexIds: facts.indexes.map((index) => index.id),
      })
      const requiredChunks = indexChunks.filter((chunk) => scope.requiredIndexIds.includes(chunk.documentIndexId))
      const relationTargetChunks = indexChunks.filter((chunk) =>
        scope.relationTargetIndexIds.includes(chunk.documentIndexId),
      )
      const chunkCountsByDocumentIndexId = indexChunks.reduce<Record<string, number>>((counts, chunk) => {
        counts[chunk.documentIndexId] = (counts[chunk.documentIndexId] ?? 0) + 1

        return counts
      }, {})

      return {
        snapshot: RetrievalSnapshotKnowledgeBaseAssembler.withRetrievalChunks(facts, requiredChunks),
        candidates,
        contextChunks: neighboringChunks,
        relationTargetChunks,
        chunkCountsByDocumentIndexId,
        selection: scope,
      }
    })
    const ranking = this.rankRetrievalCandidates(
      candidates,
      scope.retrievalIndexIds,
      snapshot.chunks,
      retrievalMatchLimit,
    )
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

    const retrievalContentFacts = {
      projectId: retrievalRequest.projectId,
      snapshot,
      chunkCountsByDocumentIndexId,
      requiredMembers: scope.requiredMembers,
      rankedChunks: context.completeChunkRanking,
      vectorRanked: ranking.vectorRanked,
      lexicalRanked: ranking.lexicalRanked,
      neighboringChunksById: context.neighboringChunksById,
      relationResolutionById,
    }

    this.ensureRetrievalResultRequirements(retrievalContentFacts)

    const knowledgeBase = snapshot.knowledgeBase

    if (knowledgeBase === null) return null

    knowledgeBase.recordRetrieval(
      RetrievalKnowledgeBaseContentAssembler.toRetrievalEvidence(
        retrievalContentFacts,
        queryEmbedding,
        retrievalRequest.queryText,
      ),
    )

    return knowledgeBase
  }

  private async loadSnapshotFacts(projectId: string): Promise<RetrievalSnapshot> {
    const knowledgeBaseProjectQO = { projectId }
    const knowledgeBase = await this.knowledgeBaseRepository.findByProjectId(knowledgeBaseProjectQO)
    const memberships = knowledgeBase
      ? await this.loadRetrievalMemberships.execute({ knowledgeBaseId: knowledgeBase.id })
      : []
    const documentIds = memberships.map((membership) => membership.documentId)
    const documents = await this.loadRetrievalDocuments.execute({ documentIds })
    const indexes = await this.loadRetrievalDocumentIndexes.execute({ documentIds })
    const revisions = await this.loadRetrievalDocumentRevisions.execute({
      revisionIds: indexes.map((index) => index.revisionId),
    })
    const relations = await this.loadRetrievalDocumentRelations.execute({
      documentIndexIds: indexes.map((index) => index.id),
    })

    return RetrievalSnapshotKnowledgeBaseAssembler.toRetrievalSnapshot({
      knowledgeBase,
      knowledgeBaseId: knowledgeBase?.id ?? null,
      memberships,
      documents,
      indexes,
      revisions,
      relations,
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
      readyAt: DateTime | null
    },
    TRevision extends { id: string; content: string },
  >(
    retrievalScopeFacts: RetrievalScopeInput<TMembership, TDocument, TIndex, TRevision>,
  ): RetrievalScopeSelection<TMembership, TIndex> {
    if (
      !retrievalScopeFacts.queryEmbedding.length ||
      retrievalScopeFacts.queryEmbedding.some((embeddingComponent) => !Number.isFinite(embeddingComponent))
    ) {
      throw new KnowledgeEmbeddingUnavailableException()
    }

    if (!retrievalScopeFacts.knowledgeBaseId) {
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

    const documentById = new Map(retrievalScopeFacts.documents.map((document) => [document.id, document]))
    const requestedReference = retrievalScopeFacts.documentReference
      ? DocumentReference.tryCreate(retrievalScopeFacts.documentReference)
      : null
    const requestedMembers = retrievalScopeFacts.documentReference
      ? retrievalScopeFacts.memberships.filter((membership) => {
          const documentReference = DocumentReference.tryCreate(documentById.get(membership.documentId)?.sourcePath)

          return Boolean(requestedReference && documentReference?.refersToSameDocument(requestedReference))
        })
      : retrievalScopeFacts.memberships

    if (retrievalScopeFacts.documentReference && (!requestedReference || requestedMembers.length !== 1)) {
      throw new DocumentReferenceResolutionAmbiguousException({ matchingDocumentCount: requestedMembers.length })
    }

    const activeIndexIds = requestedMembers.flatMap((member) => member.activeDocumentIndexId ?? [])
    const requestedDocumentIds = new Set(requestedMembers.map((member) => member.documentId))
    const requiredMembers = retrievalScopeFacts.memberships.filter((member) => member.alwaysIncludeFullContent)
    const revisionById = new Map(retrievalScopeFacts.revisions.map((revision) => [revision.id, revision]))
    const indexById = new Map(retrievalScopeFacts.indexes.map((index) => [index.id, index]))
    const unavailableRequiredMember = requiredMembers.some((member) => {
      const activeIndex = member.activeDocumentIndexId ? indexById.get(member.activeDocumentIndexId) : undefined
      const revision = activeIndex ? revisionById.get(activeIndex.revisionId) : undefined

      return (
        !activeIndex?.readyAt ||
        activeIndex.documentId !== member.documentId ||
        !documentById.has(member.documentId) ||
        typeof revision?.content !== 'string'
      )
    })

    if (
      unavailableRequiredMember ||
      (requestedMembers.length > 0 && !activeIndexIds.length && !retrievalScopeFacts.includeNonEffective)
    ) {
      throw new KnowledgeIndexPendingException()
    }

    const activeIndexIdSet = new Set(activeIndexIds)
    const requestedDocumentByActiveIndex = new Map(
      requestedMembers.flatMap((member) =>
        member.activeDocumentIndexId ? [[member.activeDocumentIndexId, member.documentId] as const] : [],
      ),
    )
    const retrievalIndexes = retrievalScopeFacts.indexes.filter(
      (index) =>
        requestedDocumentIds.has(index.documentId) &&
        index.readyAt !== null &&
        (retrievalScopeFacts.includeNonEffective || requestedDocumentByActiveIndex.get(index.id) === index.documentId),
    )
    const retrievalIndexIds = retrievalIndexes.map((index) => index.id)
    const projectActiveIndexIds = new Set(
      retrievalScopeFacts.memberships.flatMap((member) => member.activeDocumentIndexId ?? []),
    )
    const hasCompatibleProfiles = (index: TIndex): boolean =>
      index.chunkingModel === retrievalScopeFacts.profiles.chunkingModel &&
      index.chunkingProfile === retrievalScopeFacts.profiles.chunkingProfile &&
      index.embeddingProfile === retrievalScopeFacts.profiles.embeddingProfile &&
      index.lexicalProfile === retrievalScopeFacts.profiles.lexicalProfile &&
      index.relationProfile === retrievalScopeFacts.profiles.relationProfile
    const projectDocumentByActiveIndex = new Map(
      retrievalScopeFacts.memberships.flatMap((member) =>
        member.activeDocumentIndexId ? [[member.activeDocumentIndexId, member.documentId] as const] : [],
      ),
    )
    const relationTargetIndexIds = retrievalScopeFacts.indexes
      .filter(
        (index) =>
          projectActiveIndexIds.has(index.id) &&
          index.readyAt !== null &&
          projectDocumentByActiveIndex.get(index.id) === index.documentId &&
          index.embeddingModel === retrievalScopeFacts.queryEmbeddingModelId &&
          index.embeddingDimensions === retrievalScopeFacts.queryEmbedding.length &&
          hasCompatibleProfiles(index),
      )
      .map((index) => index.id)
    const requiredIndexIds = [...new Set(requiredMembers.flatMap((member) => member.activeDocumentIndexId ?? []))]

    if (requestedMembers.length > 0 && !retrievalIndexIds.length && !retrievalScopeFacts.includeNonEffective) {
      throw new KnowledgeIndexPendingException()
    }

    const activeIndexes = retrievalScopeFacts.indexes.filter(
      (index) =>
        activeIndexIdSet.has(index.id) &&
        requestedDocumentByActiveIndex.get(index.id) === index.documentId &&
        index.readyAt !== null,
    )
    const unsupportedIndex = retrievalIndexes.some(
      (index) =>
        index.embeddingModel !== retrievalScopeFacts.queryEmbeddingModelId ||
        index.lexicalProfile !== retrievalScopeFacts.lexicalProfileVersion ||
        index.embeddingDimensions !== retrievalScopeFacts.queryEmbedding.length ||
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

  private rankRetrievalCandidates(
    candidates: HybridChunkCandidate[],
    activeIndexIds: string[],
    snapshotChunks: RetrievalChunk[],
    resultLimit: number,
  ): HybridRetrievalRanking<RetrievalChunk, HybridChunkCandidate> {
    return this.rankCandidates<RetrievalChunk, HybridChunkCandidate>({
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

  private rankCandidates<TChunk, TCandidate extends { chunk: TChunk }>(
    candidateRankingFacts: HybridRetrievalInput<TChunk, TCandidate>,
  ): HybridRetrievalRanking<TChunk, TCandidate> {
    const activeIndexIds = new Set(candidateRankingFacts.activeIndexIds)
    const scopedCandidates = [
      ...new Map(
        candidateRankingFacts.candidates
          .filter((candidate) => activeIndexIds.has(candidateRankingFacts.documentIndexId(candidate.chunk)))
          .map((candidate) => [candidateRankingFacts.chunkId(candidate.chunk), candidate]),
      ).values(),
    ]
    const vectorRanked = scopedCandidates
      .filter((candidate) => candidateRankingFacts.semanticRank(candidate) !== null)
      .sort(
        (left, right) =>
          (candidateRankingFacts.semanticRank(left) ?? Infinity) -
          (candidateRankingFacts.semanticRank(right) ?? Infinity),
      )
    const lexicalRanked = scopedCandidates
      .filter((candidate) => candidateRankingFacts.lexicalRank(candidate) !== null)
      .sort(
        (left, right) =>
          (candidateRankingFacts.lexicalRank(left) ?? Infinity) -
          (candidateRankingFacts.lexicalRank(right) ?? Infinity),
      )
    const activeIndexChunks = [
      ...new Map(
        [...candidateRankingFacts.snapshotChunks, ...scopedCandidates.map(({ chunk }) => chunk)].map((chunk) => [
          candidateRankingFacts.chunkId(chunk),
          chunk,
        ]),
      ).values(),
    ].filter((chunk) => activeIndexIds.has(candidateRankingFacts.documentIndexId(chunk)))
    const fusedChunkRanking = this.reciprocalRankFusion(
      [vectorRanked.map(({ chunk }) => chunk), lexicalRanked.map(({ chunk }) => chunk)],
      candidateRankingFacts.chunkId,
      candidateRankingFacts.resultLimit,
    )

    return { scopedCandidates, vectorRanked, lexicalRanked, activeIndexChunks, fusedChunkRanking }
  }

  private reciprocalRankFusion<T>(
    rankedLists: readonly (readonly T[])[],
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
      relationType: DocumentRelationTypeEnum
    },
    TMembership extends { documentId: string; activeDocumentIndexId: string | null },
    TDocument extends { id: string; sourcePath: string },
    TIndex extends { id: string; documentId: string; readyAt: DateTime | null },
    TChunk extends { documentIndexId: string; headingPath: string[] },
  >(relationTargetFacts: {
    relations: TRelation[]
    projectMembers: TMembership[]
    eligibleTargetIndexIds: readonly string[]
    documents: TDocument[]
    indexes: TIndex[]
    relationTargetChunks: TChunk[]
  }): Map<string, ResolvedDocumentRelationTarget<TRelation['relationType']>> {
    const documentById = new Map(relationTargetFacts.documents.map((document) => [document.id, document]))
    const indexById = new Map(relationTargetFacts.indexes.map((index) => [index.id, index]))
    const eligibleTargetIndexIds = new Set(relationTargetFacts.eligibleTargetIndexIds)

    type ReadyTarget = { document: TDocument; index: TIndex; reference: DocumentReference }
    const resolveReadyTarget = (member: TMembership): ReadyTarget[] => {
      if (!member.activeDocumentIndexId) return []

      const document = documentById.get(member.documentId)
      const index = indexById.get(member.activeDocumentIndexId)

      if (!document || !index?.readyAt || index.documentId !== member.documentId) return []

      if (!eligibleTargetIndexIds.has(index.id)) return []

      const reference = DocumentReference.tryCreate(document.sourcePath)

      if (!reference) return []

      return [{ document, index, reference }]
    }
    const readyTargets = relationTargetFacts.projectMembers.flatMap(resolveReadyTarget)
    const findByTargetReferenceAndRelationType = (
      targetReference: DocumentReference | null,
      relationType: DocumentRelationTypeEnum,
    ): ReadyTarget[] => {
      if (!targetReference) return []

      const exactTargets = readyTargets.filter((target) => target.reference.refersToSameDocument(targetReference))

      if (exactTargets.length > 0 || relationType !== DocumentRelationTypeEnum.WIKI_LINK) return exactTargets

      return readyTargets.filter((target) => target.reference.path.endsWith(`/${targetReference.path}`))
    }
    const resolveReference = (relation: TRelation, targetAnchor: string | null): DocumentReference | null => {
      const sourceIndex = indexById.get(relation.sourceIndexId)

      if (!sourceIndex) return null

      const sourceDocument = documentById.get(sourceIndex.documentId)

      if (!sourceDocument) return null

      const targetPath = this.resolveTargetPath(
        relation.targetReference,
        sourceDocument.sourcePath,
        relation.relationType,
      )

      return DocumentReference.tryCreate(targetPath, targetAnchor)
    }
    const isAnchorMissing = (
      target: ReadyTarget | undefined,
      targetAnchor: string | null,
      targetReference: DocumentReference | null,
    ): boolean => {
      if (!target || !targetAnchor) return false

      return !relationTargetFacts.relationTargetChunks.some(
        (chunk) =>
          chunk.documentIndexId === target.index.id && targetReference?.matchesHeadingPath(chunk.headingPath) === true,
      )
    }
    const resolveStatus = (targetDocumentId: string | null, anchorMissing: boolean, candidateCount: number) => {
      if (targetDocumentId && !anchorMissing) return DocumentRelationResolutionEnum.RESOLVED

      if (candidateCount > 1) return DocumentRelationResolutionEnum.AMBIGUOUS

      return DocumentRelationResolutionEnum.MISSING
    }
    const resolveRelation = (relation: TRelation): ResolvedDocumentRelationTarget<TRelation['relationType']> => {
      const targetAnchor = this.resolveTargetAnchor(relation.targetAnchor, relation.targetReference)
      const targetReference = resolveReference(relation, targetAnchor)
      const matchingTargets = findByTargetReferenceAndRelationType(targetReference, relation.relationType)
      const uniqueTarget = matchingTargets.length === 1 ? matchingTargets[0] : undefined
      const anchorMissing = isAnchorMissing(uniqueTarget, targetAnchor, targetReference)
      const targetDocumentId = uniqueTarget?.document.id ?? null
      const targetIndexId = anchorMissing ? null : (uniqueTarget?.index.id ?? null)
      const candidateCount = matchingTargets.length
      const resolution = resolveStatus(targetDocumentId, anchorMissing, candidateCount)

      return {
        targetDocumentId,
        targetAnchor,
        targetReference,
        targetIndexId,
        candidateCount,
        resolution,
        relationType: relation.relationType,
      }
    }
    const toResolutionEntry = (
      relation: TRelation,
    ): [string, ResolvedDocumentRelationTarget<TRelation['relationType']>] => {
      const resolution = resolveRelation(relation)

      return [relation.id, resolution]
    }

    return new Map(relationTargetFacts.relations.map(toResolutionEntry))
  }

  private resolveTargetPath(reference: string, sourcePath: string, relationType: DocumentRelationTypeEnum): string {
    if (/^[a-z][a-z\d+.-]*:/i.test(reference.trim())) return ''

    const targetPath = reference.split('|', 1)[0]?.split('#', 1)[0]?.trim().replaceAll('\\', '/') ?? ''

    if (!targetPath) return sourcePath

    if (targetPath.startsWith('/')) return targetPath.slice(1)

    if (relationType === DocumentRelationTypeEnum.WIKI_LINK) return targetPath

    const sourceDirectory = sourcePath.slice(0, Math.max(0, sourcePath.lastIndexOf('/')))

    return `${sourceDirectory}/${targetPath}`
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
      targetReference: DocumentReference | null
    },
    TChunk extends { id: string; documentIndexId: string; headingPath: string[]; blockStart: number; blockEnd: number },
  >(relationExpansionFacts: {
    relations: TRelation[]
    activeIndexChunks: TChunk[]
    resolutionById: Map<string, TResolution>
    relationTargetChunks: TChunk[]
  }): TChunk[] {
    const relationsBySourceIndex = relationExpansionFacts.relations.reduce((relationsBySourceIndexId, relation) => {
      const group = relationsBySourceIndexId.get(relation.sourceIndexId) ?? []
      relationsBySourceIndexId.set(relation.sourceIndexId, [...group, relation])

      return relationsBySourceIndexId
    }, new Map<string, TRelation[]>())
    const initialState: RetrievalExpansionState<TChunk> = {
      expandedIndexIds: new Set(),
      expandedChunkIds: new Set(relationExpansionFacts.activeIndexChunks.map((chunk) => chunk.id)),
      chunks: [],
      processedRelationCount: 0,
    }
    const sourceIndexIds = [
      ...new Set(relationExpansionFacts.activeIndexChunks.map((chunk) => chunk.documentIndexId)),
    ].slice(0, RELATION_EXPANSION_RELATION_LIMIT)

    const sourceRelationsFor = (
      sourceIndexId: string,
      evidenceChunks: TChunk[],
      state: RetrievalExpansionState<TChunk>,
    ) => {
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
      state: RetrievalExpansionState<TChunk>,
      relation: TRelation,
      visitedIndexIds: Set<string>,
    ): { state: RetrievalExpansionState<TChunk>; targetIndexId: string | null; matchingChunks: TChunk[] } => {
      if (
        state.processedRelationCount >= RELATION_EXPANSION_RELATION_LIMIT ||
        state.chunks.length >= RELATION_EXPANSION_CHUNK_LIMIT
      ) {
        return { state, targetIndexId: null, matchingChunks: [] }
      }

      const relationState: RetrievalExpansionState<TChunk> = {
        expandedIndexIds: state.expandedIndexIds,
        expandedChunkIds: state.expandedChunkIds,
        chunks: state.chunks,
        processedRelationCount: state.processedRelationCount + 1,
      }
      const resolution = relationExpansionFacts.resolutionById.get(relation.id)
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
      const matchingChunks = relationExpansionFacts.relationTargetChunks
        .filter(
          (chunk) =>
            chunk.documentIndexId === targetIndexId &&
            !relationState.expandedChunkIds.has(chunk.id) &&
            (!targetReference || targetReference.matchesHeadingPath(chunk.headingPath)),
        )
        .slice(0, Math.min(RELATION_TARGET_CHUNK_LIMIT, RELATION_EXPANSION_CHUNK_LIMIT - relationState.chunks.length))

      if (!matchingChunks.length) return skipped

      const expandedState: RetrievalExpansionState<TChunk> = {
        expandedIndexIds: new Set([...relationState.expandedIndexIds, targetIndexId]),
        expandedChunkIds: new Set([...relationState.expandedChunkIds, ...matchingChunks.map((chunk) => chunk.id)]),
        chunks: [...relationState.chunks, ...matchingChunks],
        processedRelationCount: relationState.processedRelationCount,
      }

      return { state: expandedState, targetIndexId, matchingChunks }
    }

    const expandFirstHop = (
      currentState: RetrievalExpansionState<TChunk>,
      relation: TRelation,
      visitedIndexIds: Set<string>,
    ): RetrievalExpansionState<TChunk> => {
      const firstHop = expandTarget(currentState, relation, visitedIndexIds)

      if (!firstHop.targetIndexId || RELATION_EXPANSION_MAX_DEPTH < 2) return firstHop.state

      const nextVisitedIndexIds = new Set([...visitedIndexIds, firstHop.targetIndexId])
      const expandSecondHop = (
        nextState: RetrievalExpansionState<TChunk>,
        nextRelation: TRelation,
      ): RetrievalExpansionState<TChunk> => expandTarget(nextState, nextRelation, nextVisitedIndexIds).state
      const secondHopRelations = sourceRelationsFor(firstHop.targetIndexId, firstHop.matchingChunks, firstHop.state)

      return secondHopRelations.reduce(expandSecondHop, firstHop.state)
    }
    const expandSourceIndex = (
      state: RetrievalExpansionState<TChunk>,
      sourceIndexId: string,
    ): RetrievalExpansionState<TChunk> => {
      const visitedIndexIds = new Set([sourceIndexId])
      const evidenceChunks = relationExpansionFacts.activeIndexChunks.filter(
        (chunk) => chunk.documentIndexId === sourceIndexId,
      )
      const expandSourceRelation = (
        currentState: RetrievalExpansionState<TChunk>,
        relation: TRelation,
      ): RetrievalExpansionState<TChunk> => expandFirstHop(currentState, relation, visitedIndexIds)
      const sourceRelations = sourceRelationsFor(sourceIndexId, evidenceChunks, state)

      return sourceRelations.reduce(expandSourceRelation, state)
    }
    // Two explicit hops preserve depth-first ordering without recursive traversal.
    const expansion = sourceIndexIds.reduce(expandSourceIndex, initialState)

    return expansion.chunks
  }

  private selectContext<
    TChunk extends { id: string; documentIndexId: string; ordinal: number },
    TMember extends { activeDocumentIndexId: string | null },
  >(retrievalContextFacts: RetrievalContextInput<TChunk, TMember>): RetrievalContextSelection<TChunk> {
    const activeIndexIds = new Set(retrievalContextFacts.activeIndexIds)
    const requiredIndexIds = new Set(
      retrievalContextFacts.requiredMembers.flatMap((member) =>
        member.activeDocumentIndexId ? [member.activeDocumentIndexId] : [],
      ),
    )
    const mandatoryChunks = retrievalContextFacts.activeIndexChunks.filter((chunk) =>
      requiredIndexIds.has(chunk.documentIndexId),
    )
    const requiredChunks = retrievalContextFacts.snapshotChunks.filter((chunk) =>
      requiredIndexIds.has(chunk.documentIndexId),
    )
    const allMandatoryChunks = this.uniqueChunks([...mandatoryChunks, ...requiredChunks])
    const supplementalChunks = this.uniqueChunks([...allMandatoryChunks, ...retrievalContextFacts.expandedChunks])
    const rankedChunkIds = new Set(retrievalContextFacts.fusedChunkRanking.map(({ candidate }) => candidate.id))
    const completeChunkRanking = retrievalContextFacts.fusedChunkRanking.concat(
      supplementalChunks
        .filter((chunk) => !rankedChunkIds.has(chunk.id))
        .map((candidate, index) => ({
          candidate,
          score: 0,
          rank: retrievalContextFacts.fusedChunkRanking.length + index + 1,
        })),
    )
    const mandatoryChunkIds = new Set(allMandatoryChunks.map((chunk) => chunk.id))
    const classifyContext = (ranked: RankedCandidate<TChunk>) => {
      const isEffective = activeIndexIds.has(ranked.candidate.documentIndexId)
      const isMandatoryContext = mandatoryChunkIds.has(ranked.candidate.id)

      return {
        candidate: ranked.candidate,
        score: ranked.score,
        rank: ranked.rank,
        isEffective,
        isMandatoryContext,
      }
    }
    const classifiedChunkRanking = completeChunkRanking.map(classifyContext)

    const availableContextChunks = this.uniqueChunks([
      ...retrievalContextFacts.contextChunks,
      ...requiredChunks,
      ...retrievalContextFacts.expandedChunks,
    ])
    const neighboringSourceChunks = this.uniqueChunks([
      ...availableContextChunks,
      ...completeChunkRanking.map(({ candidate }) => candidate),
      ...retrievalContextFacts.relationTargetChunks,
    ])
    const chunksByIndexAndOrdinal = neighboringSourceChunks.reduce((grouped, chunk) => {
      const chunksByOrdinal = grouped.get(chunk.documentIndexId) ?? new Map<number, TChunk>()
      chunksByOrdinal.set(chunk.ordinal, chunk)
      grouped.set(chunk.documentIndexId, chunksByOrdinal)

      return grouped
    }, new Map<string, Map<number, TChunk>>())
    const toNeighborEntry = ({ candidate }: RankedCandidate<TChunk>) => {
      const chunksByOrdinal = chunksByIndexAndOrdinal.get(candidate.documentIndexId)
      const previousChunk = chunksByOrdinal?.get(candidate.ordinal - 1) ?? null
      const nextChunk = chunksByOrdinal?.get(candidate.ordinal + 1) ?? null
      const neighbors = { previousChunk, nextChunk }

      return [candidate.id, neighbors] as const
    }
    const neighboringChunksById = new Map(completeChunkRanking.map(toNeighborEntry))

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

  private ensureRetrievalResultRequirements(retrievalContentFacts: RetrievalKnowledgeBaseContentAssemblerInput): void {
    const indexesById = new Map(retrievalContentFacts.snapshot.indexes.map((index) => [index.id, index]))
    const documentsById = new Map(retrievalContentFacts.snapshot.documents.map((document) => [document.id, document]))
    const revisionsById = new Map(retrievalContentFacts.snapshot.revisions.map((revision) => [revision.id, revision]))
    const relationsBySourceIndexId = new Map<string, typeof retrievalContentFacts.snapshot.relations>()

    retrievalContentFacts.snapshot.relations.forEach((relation) => {
      const relations = relationsBySourceIndexId.get(relation.sourceIndexId) ?? []
      relations.push(relation)
      relationsBySourceIndexId.set(relation.sourceIndexId, relations)
    })

    retrievalContentFacts.rankedChunks.forEach(({ candidate: chunk }) => {
      const index = this.requireReadyIndex(indexesById.get(chunk.documentIndexId), chunk.documentIndexId)
      this.requireDocument(documentsById.get(index.documentId), index.documentId)
      const revision = this.requireRevision(revisionsById.get(index.revisionId), index.revisionId)
      this.requireRevisionIdentity(revision.contentSha256, index.revisionId)
      this.requireExactChunkCount(retrievalContentFacts.chunkCountsByDocumentIndexId[chunk.documentIndexId], chunk)

      const relations = relationsBySourceIndexId.get(chunk.documentIndexId) ?? []
      relations.forEach((relation) => {
        const sourceIndex = this.requireSourceIndex(indexesById.get(relation.sourceIndexId), relation.id)
        this.requireSourceDocument(documentsById.get(sourceIndex.documentId), relation.id)
        this.requireRelationResolution(retrievalContentFacts.relationResolutionById.has(relation.id), relation.id)
      })
    })

    retrievalContentFacts.requiredMembers.forEach((member) => {
      const activeIndexId = this.requireActiveIndexId(member.activeDocumentIndexId, member.documentId)
      const index = this.requireReadyIndex(indexesById.get(activeIndexId), activeIndexId)
      this.requireMembershipIndexDocument(index.documentId === member.documentId, member.documentId, index.id)
      const document = this.requireDocument(documentsById.get(member.documentId), member.documentId)
      const revision = this.requireRevision(revisionsById.get(index.revisionId), index.revisionId)
      this.requireRevisionIdentity(revision.contentSha256, document.id)
      this.requireFullContent(revision.content, document.id)
    })
  }

  private requireReadyIndex<TIndex extends { readyAt: DateTime | null }>(
    index: TIndex | undefined,
    indexId: string,
  ): TIndex {
    if (!index?.readyAt) {
      throw new RetrievalReadyIndexMissingException({ indexId })
    }

    return index
  }

  private requireDocument<TDocument>(document: TDocument | undefined, documentId: string): TDocument {
    if (!document) {
      throw new RetrievalDocumentMissingException({ documentId })
    }

    return document
  }

  private requireRevision<TRevision>(revision: TRevision | undefined, revisionId: string): TRevision {
    if (!revision) {
      throw new RetrievalRevisionMissingException({ revisionId })
    }

    return revision
  }

  private requireRevisionIdentity(contentSha256: string, revisionId: string): void {
    if (contentSha256.length === 0) {
      throw new RetrievalRevisionIdentityMissingException({ revisionId })
    }
  }

  private requireExactChunkCount(
    totalChunks: number | undefined,
    chunk: RetrievalKnowledgeBaseContentAssemblerInput['rankedChunks'][number]['candidate'],
  ): void {
    if (typeof totalChunks !== 'number' || !Number.isSafeInteger(totalChunks) || totalChunks <= chunk.ordinal) {
      throw new RetrievalExactChunkCountMissingException({ indexId: chunk.documentIndexId })
    }
  }

  private requireSourceDocument(document: unknown, relationId: string): void {
    if (!document) {
      throw new RetrievalRelationSourceDocumentMissingException({ relationId })
    }
  }

  private requireSourceIndex<TIndex extends { documentId: string }>(
    index: TIndex | undefined,
    relationId: string,
  ): TIndex {
    if (!index) {
      throw new RetrievalRelationSourceIndexMissingException({ relationId })
    }

    return index
  }

  private requireActiveIndexId(indexId: string | null, documentId: string): string {
    if (!indexId) {
      throw new RequiredDocumentActiveIndexMissingException({ documentId })
    }

    return indexId
  }

  private requireMembershipIndexDocument(matches: boolean, documentId: string, indexId: string): void {
    if (!matches) {
      throw new RequiredDocumentActiveIndexMismatchException({ indexId, documentId })
    }
  }

  private requireRelationResolution(hasResolution: boolean, relationId: string): void {
    if (!hasResolution) {
      throw new RetrievalRelationResolutionMissingException({ relationId })
    }
  }

  private requireFullContent(content: string | null, documentId: string): void {
    if (typeof content !== 'string') {
      throw new RequiredDocumentFullContentMissingException({ documentId })
    }
  }
}
