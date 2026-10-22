import type { DocumentSourceTypeEnum } from '../../Document/Enums/document-source-type.enum.ts'
import type { DocumentRelationTypeEnum } from '../../DocumentRelation/Enums/document-relation-type.enum.ts'
import { InvalidKnowledgeBaseStateException } from '../Exceptions/invalid-knowledge-base-state.exception.ts'

export type KnowledgeGraphNode = {
  readonly id: string
  readonly title: string
  readonly sourcePath: string
  readonly sourceType: DocumentSourceTypeEnum
  readonly isCenter: boolean
  readonly relationCount: number
}

export type KnowledgeGraphEvidence = {
  readonly sourceChunkId: string | null
  readonly targetChunkId: string | null
  readonly sourceBlockStart: number
  readonly sourceBlockEnd: number
  readonly targetBlockStart: number | null
  readonly targetBlockEnd: number | null
  readonly excerpt: string
  readonly targetExcerpt: string | null
}

export type KnowledgeGraphEdge = {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly kind: 'explicit' | 'semantic'
  readonly score: number | null
  readonly relationType: DocumentRelationTypeEnum | null
  readonly evidence: KnowledgeGraphEvidence
}

export type KnowledgeGraphState = {
  readonly status: 'ready' | 'partial' | 'empty' | 'document_not_found'
  readonly centerDocumentId: string | null
  readonly nodes: readonly KnowledgeGraphNode[]
  readonly edges: readonly KnowledgeGraphEdge[]
  readonly meta: {
    readonly totalDocuments: number
    readonly eligibleDocuments: number
    readonly returnedDocuments: number
    readonly truncated: boolean
    readonly omittedDocuments: number
    readonly semantic: {
      readonly strategy: 'representative_chunks'
      readonly sampledChunksPerDocument: 3
      readonly minSimilarity: number
      readonly available: boolean
    }
    readonly warnings: readonly string[]
  }
}

/** A bounded, immutable graph projection owned by the loaded knowledge base. */
export class KnowledgeBaseGraph {
  readonly status: KnowledgeGraphState['status']

  readonly centerDocumentId: string | null

  readonly nodes: readonly KnowledgeGraphNode[]

  readonly edges: readonly KnowledgeGraphEdge[]

  readonly meta: KnowledgeGraphState['meta']

  constructor(graphState: KnowledgeGraphState) {
    const nodeIds = new Set(graphState.nodes.map((node) => node.id))

    if (
      nodeIds.size !== graphState.nodes.length ||
      graphState.nodes.length > 100 ||
      graphState.edges.length > 500 ||
      graphState.meta.returnedDocuments !== graphState.nodes.length ||
      graphState.edges.some(
        (edge) => !nodeIds.has(edge.source) || !nodeIds.has(edge.target) || edge.source === edge.target,
      )
    )
      throw new InvalidKnowledgeBaseStateException('graph')

    this.status = graphState.status
    this.centerDocumentId = graphState.centerDocumentId
    this.nodes = Object.freeze(graphState.nodes.map((node) => Object.freeze({ ...node })))
    this.edges = Object.freeze(
      graphState.edges.map((edge) => Object.freeze({ ...edge, evidence: Object.freeze({ ...edge.evidence }) })),
    )
    this.meta = Object.freeze({
      ...graphState.meta,
      semantic: Object.freeze({ ...graphState.meta.semantic }),
      warnings: Object.freeze([...graphState.meta.warnings]),
    })
    Object.freeze(this)
  }
}
