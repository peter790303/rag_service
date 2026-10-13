import { RagRelationResolutionEnum } from '../../../Domain/Knowledge/Enums/rag-relation-resolution.enum.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import type { RankedCandidate } from '../../../Domain/Knowledge/ValueObjects/hybrid-ranking.js'
import type {
  HybridCandidate,
  RagRelationType,
  RetrievalChunk,
  RetrievalSnapshot,
  RetrievalMembership,
} from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-retrieval-store.js'

type RetrievalRanking = RankedCandidate<RetrievalChunk>

export type RetrievalMatchView = {
  chunk: {
    id: string
    projectId: string
    documentReference: string
    documentTitle: string | null
    source: RagSourceTypeEnum
    contentVersion: string
    isEffective: boolean
    heading: string | null
    chunkIndex: number
    totalChunks: number
    headingPath: string[]
    content: string
    tokenCount: number
    indexedAt: string
    chunkingStrategyId: string | null
    startBlock: number
    embeddingModelId: string | null
    embeddingVector: number[]
    activeDocumentIndexId: string
    documentRevisionId: string | null
    searchVector: string[]
    prevChunkReference: string | null
    nextChunkReference: string | null
  }
  neighboringContext: {
    prevChunk: NeighboringChunkView | null
    nextChunk: NeighboringChunkView | null
  }
  matchType: 'hybrid'
  semanticRank: number | null
  lexicalRank: number | null
  rawSemanticScore: number | null
  rawLexicalScore: number | null
  relations: RelationView[]
  score: number
  rank: number
  isMandatoryContext: boolean
}

export type RetrievalFullContentDocumentView = {
  projectId: string
  documentReference: string
  documentTitle: string | null
  source: RagSourceTypeEnum
  contentVersion: string
  documentRevisionId: string
  content: string
}

type NeighboringChunkView = {
  chunkIndex: number
  heading: string | null
  content: string
  reference: string
}

type RelationView = {
  relationId: string
  relationType: RagRelationType
  sourceIndexId: string
  sourceDocumentReference: string
  targetDocumentReference: string
  targetAnchor: string | null
  targetDocumentId: string | null
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
  resolution: RagRelationResolutionEnum
  candidateCount: number
}

export type RelationResolutionView = {
  targetDocumentId: string | null
  targetAnchor: string | null
  candidateCount: number
  resolution: RelationView['resolution']
  relationType: RagRelationType
}

type RetrievalAssemblyContext = {
  projectId: string
  snapshot: RetrievalSnapshot
  requestedMembers: RetrievalMembership[]
  contextChunks: RetrievalChunk[]
  mandatoryChunkIds: Set<string>
  semanticByChunkId: Map<string, { rank: number | null; score: number }>
  lexicalByChunkId: Map<string, { rank: number | null; score: number }>
  relationResolutionById: Map<string, RelationResolutionView>
  documentById: Map<string, RetrievalSnapshot['documents'][number]>
  indexById: Map<string, RetrievalSnapshot['indexes'][number]>
  revisionById: Map<string, RetrievalSnapshot['revisions'][number]>
  membershipByIndexId: Map<string, RetrievalMembership>
}

export interface RetrievalResultAssemblerInput {
  projectId: string
  snapshot: RetrievalSnapshot
  requestedMembers: RetrievalMembership[]
  rankedChunks: RetrievalRanking[]
  vectorRanked: HybridCandidate[]
  lexicalRanked: HybridCandidate[]
  contextChunks: RetrievalChunk[]
  mandatoryChunks: RetrievalChunk[]
  relationResolutionById: Map<string, RelationResolutionView>
}

export interface RetrievalResultAssemblerOutput {
  matches: RetrievalMatchView[]
  fullContentDocuments: RetrievalFullContentDocumentView[]
}

export class RetrievalResultAssembler {
  static assemble(input: RetrievalResultAssemblerInput): RetrievalResultAssemblerOutput {
    const context = RetrievalResultAssembler.createContext(input)

    return {
      matches: input.rankedChunks.map((rankedChunk) => RetrievalResultAssembler.toMatchView(rankedChunk, context)),
      fullContentDocuments: RetrievalResultAssembler.toFullContentDocuments(context),
    }
  }

  private static toFullContentDocuments(context: RetrievalAssemblyContext): RetrievalFullContentDocumentView[] {
    return context.requestedMembers.flatMap((member) => {
      if (!member.alwaysIncludeFullContent || !member.activeDocumentIndexId) return []

      const index = context.indexById.get(member.activeDocumentIndexId)
      const document = context.documentById.get(member.documentId)
      const revision = index ? context.revisionById.get(index.revisionId) : undefined

      if (!index || !document || !revision || typeof revision.fullContent !== 'string') return []

      return [
        {
          projectId: context.projectId,
          documentReference: document.sourcePath,
          documentTitle: revision.title,
          source:
            document.sourceType === RagSourceTypeEnum.REPOSITORY
              ? RagSourceTypeEnum.REPOSITORY
              : RagSourceTypeEnum.OBSIDIAN,
          contentVersion: revision.contentSha256 ? `sha256:${revision.contentSha256}` : '',
          documentRevisionId: revision.id,
          content: revision.fullContent,
        },
      ]
    })
  }

  private static createContext(input: RetrievalResultAssemblerInput): RetrievalAssemblyContext {
    return {
      projectId: input.projectId,
      snapshot: input.snapshot,
      requestedMembers: input.requestedMembers,
      contextChunks: input.contextChunks,
      mandatoryChunkIds: new Set(input.mandatoryChunks.map((chunk) => chunk.id)),
      semanticByChunkId: new Map(
        input.vectorRanked.map(({ chunk, semanticScore, semanticRank }) => [
          chunk.id,
          { rank: semanticRank, score: semanticScore },
        ]),
      ),
      lexicalByChunkId: new Map(
        input.lexicalRanked.map(({ chunk, lexicalScore, lexicalRank }) => [
          chunk.id,
          { rank: lexicalRank, score: lexicalScore },
        ]),
      ),
      relationResolutionById: input.relationResolutionById,
      documentById: new Map(input.snapshot.documents.map((document) => [document.id, document])),
      indexById: new Map(input.snapshot.indexes.map((index) => [index.id, index])),
      revisionById: new Map(input.snapshot.revisions.map((revision) => [revision.id, revision])),
      membershipByIndexId: new Map(
        input.requestedMembers.flatMap((member) =>
          member.activeDocumentIndexId ? [[member.activeDocumentIndexId, member] as const] : [],
        ),
      ),
    }
  }

  private static toMatchView(rankedChunk: RetrievalRanking, context: RetrievalAssemblyContext): RetrievalMatchView {
    const { candidate: chunk, score, rank } = rankedChunk
    const relatedChunks = context.contextChunks.filter(
      (candidate) => candidate.documentIndexId === chunk.documentIndexId,
    )
    const previousChunk = relatedChunks.find((candidate) => candidate.ordinal === chunk.ordinal - 1)
    const nextChunk = relatedChunks.find((candidate) => candidate.ordinal === chunk.ordinal + 1)
    const semanticRanking = context.semanticByChunkId.get(chunk.id)
    const lexicalRanking = context.lexicalByChunkId.get(chunk.id)

    return {
      chunk: RetrievalResultAssembler.toChunkView(
        chunk,
        RetrievalResultAssembler.getTotalChunkCount(chunk, relatedChunks, context.snapshot),
        previousChunk,
        nextChunk,
        context,
      ),
      neighboringContext: {
        prevChunk: RetrievalResultAssembler.toNeighborView(previousChunk),
        nextChunk: RetrievalResultAssembler.toNeighborView(nextChunk),
      },
      matchType: 'hybrid',
      semanticRank: semanticRanking?.rank ?? null,
      lexicalRank: lexicalRanking?.rank ?? null,
      rawSemanticScore: semanticRanking?.score ?? null,
      rawLexicalScore: lexicalRanking?.score ?? null,
      relations: context.snapshot.relations
        .filter((relation) => relation.sourceIndexId === chunk.documentIndexId)
        .map((relation) => RetrievalResultAssembler.toRelationView(relation, context)),
      score,
      rank,
      isMandatoryContext: context.mandatoryChunkIds.has(chunk.id),
    }
  }

  private static toChunkView(
    chunk: RetrievalChunk,
    totalChunks: number,
    previousChunk: RetrievalChunk | undefined,
    nextChunk: RetrievalChunk | undefined,
    context: RetrievalAssemblyContext,
  ): RetrievalMatchView['chunk'] {
    const index = context.indexById.get(chunk.documentIndexId)
    const document = index ? context.documentById.get(index.documentId) : undefined
    const revision = index ? context.revisionById.get(index.revisionId) : undefined

    return {
      id: chunk.id,
      projectId: context.projectId,
      documentReference: document?.sourcePath ?? '',
      documentTitle: revision?.title ?? null,
      source:
        document?.sourceType === RagSourceTypeEnum.REPOSITORY
          ? RagSourceTypeEnum.REPOSITORY
          : RagSourceTypeEnum.OBSIDIAN,
      contentVersion: revision?.contentSha256 ? `sha256:${revision.contentSha256}` : '',
      isEffective: context.membershipByIndexId.has(chunk.documentIndexId),
      heading: chunk.headingPath.at(-1) ?? null,
      chunkIndex: chunk.ordinal,
      totalChunks,
      headingPath: chunk.headingPath,
      content: chunk.content,
      tokenCount: chunk.tokenCount ?? 0,
      indexedAt: index?.readyAt?.toISOString() ?? new Date(0).toISOString(),
      chunkingStrategyId: index?.chunkingProfile ?? null,
      startBlock: chunk.blockStart,
      embeddingModelId: index?.embeddingModel ?? null,
      embeddingVector: chunk.embedding,
      activeDocumentIndexId: chunk.documentIndexId,
      documentRevisionId: index?.revisionId ?? null,
      searchVector: chunk.searchVector,
      prevChunkReference: previousChunk?.id ?? null,
      nextChunkReference: nextChunk?.id ?? null,
    }
  }

  private static toRelationView(
    relation: RetrievalSnapshot['relations'][number],
    context: RetrievalAssemblyContext,
  ): RelationView {
    const sourceIndex = context.indexById.get(relation.sourceIndexId)
    const sourceDocument = sourceIndex ? context.documentById.get(sourceIndex.documentId) : undefined
    const resolution = context.relationResolutionById.get(relation.id) ?? {
      targetDocumentId: null,
      targetAnchor: relation.targetAnchor,
      candidateCount: 0,
      resolution: RagRelationResolutionEnum.MISSING,
      relationType: relation.relationType,
    }

    return {
      relationId: relation.id,
      relationType: resolution.relationType,
      sourceIndexId: relation.sourceIndexId,
      sourceDocumentReference: sourceDocument?.sourcePath ?? '',
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

  private static getTotalChunkCount(
    chunk: RetrievalChunk,
    availableChunks: RetrievalChunk[],
    snapshot: RetrievalSnapshot,
  ): number {
    const visibleCount = availableChunks.reduce((count, candidate) => Math.max(count, candidate.ordinal + 1), 0)

    return Math.max(snapshot.chunkCountsByIndexId?.[chunk.documentIndexId] ?? 0, visibleCount)
  }

  private static toNeighborView(chunk: RetrievalChunk | undefined): NeighboringChunkView | null {
    return chunk
      ? {
          chunkIndex: chunk.ordinal,
          heading: chunk.headingPath.at(-1) ?? null,
          content: chunk.content,
          reference: chunk.id,
        }
      : null
  }
}

export const normalizeDocumentPath = (sourcePath: string): string =>
  normalizePathSegments(sourcePath.split(/[|#?]/, 1)[0]?.trim().replaceAll('\\', '/') ?? '')
    .replace(/\.md$/i, '')
    .toLocaleLowerCase('en-US')

export const normalizeReference = (reference: string, sourcePath: string): string => {
  const targetPath = reference.split('|', 1)[0]?.split('#', 1)[0]?.trim().replaceAll('\\', '/') ?? ''

  if (!targetPath) return normalizeDocumentPath(sourcePath)

  const sourceDirectory = sourcePath.includes('/') ? sourcePath.slice(0, sourcePath.lastIndexOf('/')) : ''
  const combinedPath = targetPath.startsWith('/') ? targetPath.slice(1) : `${sourceDirectory}/${targetPath}`

  return normalizeDocumentPath(combinedPath)
}

const normalizePathSegments = (path: string): string => {
  const segments: string[] = []

  for (const segment of path.split('/')) {
    if (!segment || segment === '.') continue

    if (segment === '..') segments.pop()
    else segments.push(segment)
  }

  return segments.join('/')
}
