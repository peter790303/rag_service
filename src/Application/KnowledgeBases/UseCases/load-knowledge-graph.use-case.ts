import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import { DocumentReference } from '../../../Domain/DocumentRelation/ValueObjects/document-reference.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeGraphEdge } from '../../../Domain/KnowledgeBase/ValueObjects/knowledge-base-graph.ts'
import type { FindGraphChunkCandidatesUseCaseContract } from '../../Chunks/Contracts/find-graph-chunk-candidates.use-case.contract.ts'
import type { LoadGraphChunksUseCaseContract } from '../../Chunks/Contracts/load-graph-chunks.use-case.contract.ts'
import type { LoadRetrievalDocumentIndexesUseCaseContract } from '../../DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import type { LoadRetrievalDocumentRelationsUseCaseContract } from '../../DocumentRelations/Contracts/load-retrieval-document-relations.use-case.contract.ts'
import type { LoadRetrievalDocumentsUseCaseContract } from '../../Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import { KnowledgeGraphAssembler } from '../Assemblers/knowledge-graph.assembler.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../Contracts/persistence-transaction.ts'
import type { LoadKnowledgeGraphDTO } from '../DataTransferObjects/load-knowledge-graph.dto.ts'
import { InvalidKnowledgeGraphQueryException } from '../Exceptions/invalid-knowledge-graph-query.exception.ts'

type GraphDocument = { document: Document; index: DocumentIndex }
type CenterCandidates = { edges: KnowledgeGraphEdge[]; candidateLimitReached: boolean }

/** Read-only, project-scoped graph of persisted references and bounded vector evidence. */
export class LoadKnowledgeGraphUseCase {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly knowledgeBaseRepository: KnowledgeBaseRepository,
    private readonly loadMemberships: LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
    private readonly loadDocuments: LoadRetrievalDocumentsUseCaseContract,
    private readonly loadIndexes: LoadRetrievalDocumentIndexesUseCaseContract,
    private readonly loadRelations: LoadRetrievalDocumentRelationsUseCaseContract,
    private readonly loadGraphChunks: LoadGraphChunksUseCaseContract,
    private readonly findGraphCandidates: FindGraphChunkCandidatesUseCaseContract,
  ) {}

  async execute(loadKnowledgeGraphDTO: LoadKnowledgeGraphDTO): Promise<KnowledgeBase | null> {
    this.validateQuery(loadKnowledgeGraphDTO)

    return this.persistenceTransaction.runReadOnlySnapshot(() => this.loadGraph(loadKnowledgeGraphDTO))
  }

  private async loadGraph(graphQueryDTO: LoadKnowledgeGraphDTO): Promise<KnowledgeBase | null> {
    const knowledgeBaseProjectQO = KnowledgeGraphAssembler.toKnowledgeBaseProjectQueryObject(graphQueryDTO.projectId)
    const knowledgeBase = await this.knowledgeBaseRepository.findByProjectId(knowledgeBaseProjectQO)

    if (!knowledgeBase) return null

    const warnings = new Set<string>()
    const memberships = await this.loadMemberships.execute({ knowledgeBaseId: knowledgeBase.id })
    const documentIds = memberships.map((membership) => membership.documentId)
    const [documents, indexes] = await Promise.all([
      this.loadDocuments.execute({ documentIds }),
      this.loadIndexes.execute({ documentIds }),
    ])
    const documentById = new Map(documents.map((document) => [document.id, document]))
    const indexById = new Map(indexes.map((index) => [index.id, index]))
    const eligibleDocuments = memberships
      .flatMap((membership): GraphDocument[] => {
        const document = documentById.get(membership.documentId)
        const index = membership.activeDocumentIndexId ? indexById.get(membership.activeDocumentIndexId) : undefined

        if (!document || !index || index.documentId !== membership.documentId) {
          warnings.add('missing_active_index')

          return []
        }

        if (index.status !== 'ready') {
          warnings.add('index_not_ready')

          return []
        }

        return [{ document, index }]
      })
      .sort(
        (left, right) =>
          left.document.sourcePath.localeCompare(right.document.sourcePath) ||
          left.document.id.localeCompare(right.document.id),
      )
    const centerDocumentId = graphQueryDTO.documentId ?? null
    const center = eligibleDocuments.find(({ document }) => document.id === centerDocumentId)
    const missingCenter = centerDocumentId !== null && !center
    const relations = missingCenter
      ? []
      : await this.loadRelations.execute({ documentIndexIds: eligibleDocuments.map(({ index }) => index.id) })
    const explicitEdges = this.explicitEdges(relations, eligibleDocuments)
    const minSimilarity = graphQueryDTO.minSimilarity ?? 0.65
    const centerCandidates = center
      ? await this.centerCandidates(center, eligibleDocuments, minSimilarity, warnings)
      : { edges: [], candidateLimitReached: false }
    const query = graphQueryDTO.query?.trim().toLocaleLowerCase('en-US') ?? ''
    const matchesQuery = ({ document }: GraphDocument): boolean =>
      `${document.currentTitle ?? ''} ${document.sourcePath}`.toLocaleLowerCase('en-US').includes(query)
    const centerNeighborIds = new Set(
      explicitEdges
        .filter((edge) => edge.source === centerDocumentId || edge.target === centerDocumentId)
        .flatMap((edge) => [edge.source, edge.target]),
    )
    const semanticScores = new Map<string, number>()
    centerCandidates.edges.forEach((edge) =>
      semanticScores.set(edge.source === centerDocumentId ? edge.target : edge.source, edge.score ?? 0),
    )
    const candidates = missingCenter
      ? []
      : eligibleDocuments
          .filter((graphDocument) => {
            const documentId = graphDocument.document.id

            if (documentId === centerDocumentId) return true

            return (
              matchesQuery(graphDocument) &&
              (!center || centerNeighborIds.has(documentId) || semanticScores.has(documentId))
            )
          })
          .sort((left, right) => {
            const rank = ({ document }: GraphDocument): number =>
              document.id === centerDocumentId ? 2 : centerNeighborIds.has(document.id) ? 1 : 0

            return (
              rank(right) - rank(left) ||
              (semanticScores.get(right.document.id) ?? 0) - (semanticScores.get(left.document.id) ?? 0) ||
              left.document.sourcePath.localeCompare(right.document.sourcePath) ||
              left.document.id.localeCompare(right.document.id)
            )
          })
    const selected = candidates.slice(0, graphQueryDTO.limit ?? 60)
    const selectedIds = new Set(selected.map(({ document }) => document.id))
    const representativeChunks = await this.loadGraphChunks.execute({
      documentIndexIds: selected.map(({ index }) => index.id),
    })
    const validChunks = this.validChunks(representativeChunks, selected, warnings)
    const modelKeys = new Set(selected.map(({ index }) => this.modelKey(index)))

    if (modelKeys.size > 1) warnings.add('incompatible_embedding_models')

    const semanticEdges = this.semanticEdges(
      selected,
      validChunks,
      minSimilarity,
      centerCandidates.edges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)),
    )
    const visibleEdges = [
      ...explicitEdges.filter((edge) => selectedIds.has(edge.source) && selectedIds.has(edge.target)),
      ...semanticEdges,
    ]
    const edges = visibleEdges.slice(0, 500)
    const nodeLimitReached = candidates.length > selected.length || centerCandidates.candidateLimitReached

    if (nodeLimitReached) warnings.add('result_limited')

    if (visibleEdges.length > edges.length) warnings.add('edge_limit_reached')

    const nodes = selected.map(({ document }) =>
      KnowledgeGraphAssembler.toKnowledgeGraphNode(
        document,
        centerDocumentId,
        edges.filter((edge) => edge.source === document.id || edge.target === document.id).length,
      ),
    )
    knowledgeBase.recordGraph({
      status: missingCenter
        ? 'document_not_found'
        : nodes.length === 0
          ? 'empty'
          : warnings.size > 0
            ? 'partial'
            : 'ready',
      centerDocumentId,
      nodes,
      edges,
      meta: {
        totalDocuments: memberships.length,
        eligibleDocuments: eligibleDocuments.length,
        returnedDocuments: nodes.length,
        truncated: nodeLimitReached || visibleEdges.length > edges.length,
        omittedDocuments: eligibleDocuments.length - nodes.length,
        semantic: {
          strategy: 'representative_chunks',
          sampledChunksPerDocument: 3,
          minSimilarity,
          available: validChunks.length > 0,
        },
        warnings: [...warnings].sort(),
      },
    })

    return knowledgeBase
  }

  private explicitEdges(relations: DocumentRelation[], graphDocuments: GraphDocument[]): KnowledgeGraphEdge[] {
    const byIndexId = new Map(graphDocuments.map((graphDocument) => [graphDocument.index.id, graphDocument]))
    const byDocumentId = new Map(graphDocuments.map((graphDocument) => [graphDocument.document.id, graphDocument]))

    return relations
      .flatMap((relation) => {
        const source = byIndexId.get(relation.sourceIndexId)

        if (!source) return []

        const target = relation.targetDocumentId
          ? byDocumentId.get(relation.targetDocumentId)
          : this.resolveTarget(relation, source.document, graphDocuments)

        if (!target || target.document.id === source.document.id) return []

        return [KnowledgeGraphAssembler.toExplicitEdge(relation, source.document.id, target.document.id)]
      })
      .sort((left, right) => left.id.localeCompare(right.id))
  }

  private resolveTarget(
    relation: DocumentRelation,
    source: Document,
    graphDocuments: GraphDocument[],
  ): GraphDocument | undefined {
    if (/^[a-z][a-z\d+.-]*:/i.test(relation.targetReference.trim())) return undefined

    const targetPath = relation.targetReference.split('|', 1)[0]?.split('#', 1)[0]?.trim().replaceAll('\\', '/') ?? ''
    const sourceDirectory = source.sourcePath.slice(0, Math.max(0, source.sourcePath.lastIndexOf('/')))
    const resolvedPath = !targetPath
      ? source.sourcePath
      : targetPath.startsWith('/')
        ? targetPath.slice(1)
        : relation.relationType === 'wiki_link'
          ? targetPath
          : `${sourceDirectory}/${targetPath}`
    const reference = DocumentReference.tryCreate(resolvedPath)

    if (!reference) return undefined

    const exact = graphDocuments.filter(({ document }) =>
      DocumentReference.tryCreate(document.sourcePath)?.refersToSameDocument(reference),
    )
    const matches =
      exact.length > 0 || relation.relationType !== 'wiki_link'
        ? exact
        : graphDocuments.filter(({ document }) =>
            DocumentReference.tryCreate(document.sourcePath)?.path.endsWith(`/${reference.path}`),
          )

    return matches.length === 1 ? matches[0] : undefined
  }

  private async centerCandidates(
    center: GraphDocument,
    graphDocuments: GraphDocument[],
    minSimilarity: number,
    warnings: Set<string>,
  ): Promise<CenterCandidates> {
    const chunks = await this.loadGraphChunks.execute({ documentIndexIds: [center.index.id] })
    const validCenterChunks = this.validChunks(chunks, [center], warnings)
    const compatible = graphDocuments.filter(
      ({ index }) => index.id !== center.index.id && this.modelKey(index) === this.modelKey(center.index),
    )
    const byIndexId = new Map(compatible.map((graphDocument) => [graphDocument.index.id, graphDocument]))
    const candidateBatches = await Promise.all(
      validCenterChunks.map(async (sourceChunk) => {
        const candidates = await this.findGraphCandidates.execute({
          documentIndexIds: compatible.map(({ index }) => index.id),
          queryVector: sourceChunk.embedding,
          limit: 200,
        })
        const edges = candidates.flatMap((targetChunk) => {
          const target = byIndexId.get(targetChunk.documentIndexId)

          if (!target) return []

          if (!this.validVector(targetChunk, target.index)) {
            warnings.add('invalid_vector')

            return []
          }

          const score = this.cosine(sourceChunk.embedding, targetChunk.embedding)

          if (score < minSimilarity) return []

          return [this.semanticEdge(center, target, sourceChunk, targetChunk, score)]
        })

        return { edges, limited: candidates.length === 200 }
      }),
    )
    const bestEdges = this.bestPairs(candidateBatches.flatMap((batch) => batch.edges))

    return { edges: bestEdges, candidateLimitReached: candidateBatches.some((batch) => batch.limited) }
  }

  private validChunks(chunks: Chunk[], graphDocuments: GraphDocument[], warnings: Set<string>): Chunk[] {
    const byIndexId = new Map(graphDocuments.map(({ index }) => [index.id, index]))
    graphDocuments.forEach(({ index }) => {
      if (!chunks.some((chunk) => chunk.documentIndexId === index.id)) warnings.add('missing_chunks')
    })

    return chunks.filter((chunk) => {
      const index = byIndexId.get(chunk.documentIndexId)
      const valid = index !== undefined && this.validVector(chunk, index)

      if (!valid) warnings.add('invalid_vector')

      return valid
    })
  }

  private validVector(chunk: Chunk, index: DocumentIndex): boolean {
    const vector = chunk.embedding
    const squaredMagnitude = vector.reduce((sum, coordinate) => sum + coordinate * coordinate, 0)

    return (
      vector.length === index.embeddingDimensions &&
      vector.every(Number.isFinite) &&
      Number.isFinite(squaredMagnitude) &&
      squaredMagnitude > 0
    )
  }

  private modelKey(index: DocumentIndex): string {
    return JSON.stringify([index.embeddingModel, index.embeddingDimensions, index.embeddingProfile])
  }

  private semanticEdges(
    graphDocuments: GraphDocument[],
    chunks: Chunk[],
    minSimilarity: number,
    centerEdges: KnowledgeGraphEdge[],
  ): KnowledgeGraphEdge[] {
    const pairs = graphDocuments.flatMap((source, position) =>
      graphDocuments.slice(position + 1).flatMap((target) => {
        if (this.modelKey(source.index) !== this.modelKey(target.index)) return []

        const sourceChunks = chunks.filter((chunk) => chunk.documentIndexId === source.index.id)
        const targetChunks = chunks.filter((chunk) => chunk.documentIndexId === target.index.id)

        return sourceChunks.flatMap((sourceChunk) =>
          targetChunks.flatMap((targetChunk) => {
            const score = this.cosine(sourceChunk.embedding, targetChunk.embedding)

            return score >= minSimilarity ? [this.semanticEdge(source, target, sourceChunk, targetChunk, score)] : []
          }),
        )
      }),
    )
    const degree = new Map<string, number>()

    return this.bestPairs([...centerEdges, ...pairs]).filter((edge) => {
      if ((degree.get(edge.source) ?? 0) >= 3 || (degree.get(edge.target) ?? 0) >= 3) return false

      degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
      degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)

      return true
    })
  }

  private semanticEdge(
    source: GraphDocument,
    target: GraphDocument,
    sourceChunk: Chunk,
    targetChunk: Chunk,
    score: number,
  ): KnowledgeGraphEdge {
    return source.document.id < target.document.id
      ? KnowledgeGraphAssembler.toSemanticEdge(source.document.id, target.document.id, sourceChunk, targetChunk, score)
      : KnowledgeGraphAssembler.toSemanticEdge(target.document.id, source.document.id, targetChunk, sourceChunk, score)
  }

  private bestPairs(edges: KnowledgeGraphEdge[]): KnowledgeGraphEdge[] {
    const sorted = edges.sort(
      (left, right) =>
        (right.score ?? 0) - (left.score ?? 0) ||
        left.id.localeCompare(right.id) ||
        (left.evidence.sourceChunkId ?? '').localeCompare(right.evidence.sourceChunkId ?? '') ||
        (left.evidence.targetChunkId ?? '').localeCompare(right.evidence.targetChunkId ?? ''),
    )
    const bestById = new Map<string, KnowledgeGraphEdge>()
    sorted.forEach((edge) => {
      if (!bestById.has(edge.id)) bestById.set(edge.id, edge)
    })

    return [...bestById.values()]
  }

  private cosine(left: readonly number[], right: readonly number[]): number {
    const dot = left.reduce((sum, coordinate, position) => sum + coordinate * (right[position] ?? 0), 0)
    const magnitude =
      Math.sqrt(left.reduce((sum, coordinate) => sum + coordinate * coordinate, 0)) *
      Math.sqrt(right.reduce((sum, coordinate) => sum + coordinate * coordinate, 0))

    return Math.max(-1, Math.min(1, dot / magnitude))
  }

  private validateQuery(graphQueryDTO: LoadKnowledgeGraphDTO): void {
    const limit = graphQueryDTO.limit ?? 60
    const minSimilarity = graphQueryDTO.minSimilarity ?? 0.65

    if (
      !graphQueryDTO.projectId.trim() ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100 ||
      !Number.isFinite(minSimilarity) ||
      minSimilarity < 0 ||
      minSimilarity > 1 ||
      (graphQueryDTO.query?.length ?? 0) > 200
    )
      throw new InvalidKnowledgeGraphQueryException()
  }
}
