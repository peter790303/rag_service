import type { Chunk } from '../../Chunk/chunk.ts'
import type { Document } from '../../Document/document.ts'
import type { DocumentIndex } from '../../DocumentIndex/document-index.ts'
import type { DocumentRelation } from '../../DocumentRelation/document-relation.ts'
import { DocumentRelationResolutionEnum } from '../../DocumentRelation/Enums/document-relation-resolution.enum.ts'
import type { DocumentRevision } from '../../DocumentRevision/document-revision.ts'
import type { KnowledgeBaseDocument } from '../../KnowledgeBaseDocument/knowledge-base-document.ts'
import { InvalidKnowledgeBaseRetrievalException } from '../Exceptions/invalid-knowledge-base-retrieval.exception.ts'

export type KnowledgeBaseRelationResolution = {
  readonly targetAnchor: string | null
  readonly targetDocumentId: string | null
  readonly resolution: DocumentRelationResolutionEnum
  readonly candidateCount: number
}

export type KnowledgeBaseRetrievalRelation = {
  readonly relation: DocumentRelation
  readonly sourceDocument: Document
  readonly resolution: KnowledgeBaseRelationResolution
}

export type KnowledgeBaseRetrievalDocument = {
  readonly knowledgeBaseDocument: KnowledgeBaseDocument
  readonly document: Document
  readonly index: DocumentIndex
  readonly revision: DocumentRevision
}

export type KnowledgeBaseRetrievalMatch = KnowledgeBaseRetrievalDocument & {
  readonly chunk: Chunk
  readonly totalChunks: number
  readonly previousChunk: Chunk | null
  readonly nextChunk: Chunk | null
  readonly relations: readonly KnowledgeBaseRetrievalRelation[]
  readonly score: number
  readonly rank: number
  readonly semanticRank: number | null
  readonly lexicalRank: number | null
  readonly rawSemanticScore: number | null
  readonly rawLexicalScore: number | null
  readonly isEffective: boolean
  readonly isMandatoryContext: boolean
}

export type KnowledgeBaseRetrievalState = {
  readonly queryVector: readonly number[]
  readonly queryText: string
  readonly matches: readonly KnowledgeBaseRetrievalMatch[]
  readonly requiredDocuments: readonly KnowledgeBaseRetrievalDocument[]
}

/** Validated retrieval facts for one persisted collection; no transport formatting or selection policy. */
export class KnowledgeBaseRetrieval {
  private readonly sourceQueryVector: readonly number[]

  private readonly sourceQueryText: string

  private readonly selectedMatches: readonly KnowledgeBaseRetrievalMatch[]

  private readonly selectedRequiredDocuments: readonly KnowledgeBaseRetrievalDocument[]

  constructor(knowledgeBaseId: string, state: KnowledgeBaseRetrievalState) {
    if (!state.queryVector.length || !Array.from(state.queryVector).every(Number.isFinite)) {
      throw new InvalidKnowledgeBaseRetrievalException('query vector must contain finite values')
    }

    if (typeof state.queryText !== 'string') {
      throw new InvalidKnowledgeBaseRetrievalException('query text must be a string')
    }

    state.matches.forEach((match) => KnowledgeBaseRetrieval.validateMatch(knowledgeBaseId, match))

    if (new Set(state.matches.map(({ chunk }) => chunk.id)).size !== state.matches.length) {
      throw new InvalidKnowledgeBaseRetrievalException('matched chunks must be unique')
    }

    state.requiredDocuments.forEach((document) => {
      KnowledgeBaseRetrieval.validateDocument(knowledgeBaseId, document)

      if (
        !document.knowledgeBaseDocument.alwaysIncludeFullContent ||
        document.knowledgeBaseDocument.activeDocumentIndexId !== document.index.id
      ) {
        throw new InvalidKnowledgeBaseRetrievalException('required document must use its mandatory active index')
      }
    })
    this.sourceQueryVector = Object.freeze([...state.queryVector])
    this.sourceQueryText = state.queryText
    this.selectedMatches = Object.freeze(
      state.matches.map((match) =>
        Object.freeze({
          ...match,
          relations: Object.freeze(
            match.relations.map(({ relation, sourceDocument, resolution }) =>
              Object.freeze({
                relation,
                sourceDocument,
                resolution: Object.freeze({ ...resolution }),
              }),
            ),
          ),
        }),
      ),
    )
    this.selectedRequiredDocuments = Object.freeze(
      state.requiredDocuments.map((document) => Object.freeze({ ...document })),
    )
  }

  get queryVector(): number[] {
    return [...this.sourceQueryVector]
  }

  get queryText(): string {
    return this.sourceQueryText
  }

  get matches(): readonly KnowledgeBaseRetrievalMatch[] {
    return this.selectedMatches
  }

  get requiredDocuments(): readonly KnowledgeBaseRetrievalDocument[] {
    return this.selectedRequiredDocuments
  }

  private static validateDocument(knowledgeBaseId: string, facts: KnowledgeBaseRetrievalDocument): void {
    if (
      facts.knowledgeBaseDocument.knowledgeBaseId !== knowledgeBaseId ||
      facts.knowledgeBaseDocument.documentId !== facts.document.id ||
      facts.index.documentId !== facts.document.id ||
      facts.revision.documentId !== facts.document.id ||
      facts.index.revisionId !== facts.revision.id ||
      facts.index.readyAt === null
    ) {
      throw new InvalidKnowledgeBaseRetrievalException(
        'document, revision, ready index and knowledgeBaseDocument must belong to the collection',
      )
    }
  }

  private static validateMatch(knowledgeBaseId: string, match: KnowledgeBaseRetrievalMatch): void {
    KnowledgeBaseRetrieval.validateDocument(knowledgeBaseId, match)
    match.chunk.assertBelongsToDocumentIndex(match.index.id)

    if (
      !Number.isSafeInteger(match.totalChunks) ||
      match.totalChunks <= match.chunk.ordinal ||
      !Number.isSafeInteger(match.rank) ||
      match.rank < 1 ||
      !Number.isFinite(match.score) ||
      match.score < 0
    ) {
      throw new InvalidKnowledgeBaseRetrievalException('chunk count and ranking must be valid')
    }

    if (
      match.isEffective !== (match.knowledgeBaseDocument.activeDocumentIndexId === match.index.id) ||
      match.isMandatoryContext !== (match.knowledgeBaseDocument.alwaysIncludeFullContent && match.isEffective)
    ) {
      throw new InvalidKnowledgeBaseRetrievalException(
        'effective and mandatory facts must agree with knowledgeBaseDocument',
      )
    }

    KnowledgeBaseRetrieval.validateChannel(match.semanticRank, match.rawSemanticScore)
    KnowledgeBaseRetrieval.validateChannel(match.lexicalRank, match.rawLexicalScore)
    KnowledgeBaseRetrieval.validateNeighbor(match.chunk, match.previousChunk, -1)
    KnowledgeBaseRetrieval.validateNeighbor(match.chunk, match.nextChunk, 1)
    match.relations.forEach(({ relation, sourceDocument, resolution }) => {
      if (
        relation.sourceIndexId !== match.index.id ||
        sourceDocument.id !== match.document.id ||
        !Number.isSafeInteger(resolution.candidateCount) ||
        resolution.candidateCount < 0 ||
        !Object.values(DocumentRelationResolutionEnum).includes(resolution.resolution) ||
        (resolution.resolution === DocumentRelationResolutionEnum.RESOLVED &&
          (resolution.targetDocumentId === null || resolution.candidateCount !== 1))
      ) {
        throw new InvalidKnowledgeBaseRetrievalException('relation resolution must belong to the source index')
      }
    })
  }

  private static validateChannel(rank: number | null, score: number | null): void {
    if (
      (rank === null) !== (score === null) ||
      (rank !== null && (!Number.isSafeInteger(rank) || rank < 1)) ||
      (score !== null && !Number.isFinite(score))
    ) {
      throw new InvalidKnowledgeBaseRetrievalException('retrieval channel rank and score must be paired')
    }
  }

  private static validateNeighbor(chunk: Chunk, neighbor: Chunk | null, offset: number): void {
    if (
      neighbor !== null &&
      (neighbor.documentIndexId !== chunk.documentIndexId || neighbor.ordinal !== chunk.ordinal + offset)
    ) {
      throw new InvalidKnowledgeBaseRetrievalException('neighbor must be adjacent in the same index')
    }
  }
}
