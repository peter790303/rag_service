import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'

export class KnowledgeGraphResource {
  static fromKnowledgeBase(knowledgeBase: KnowledgeBase) {
    const graph = knowledgeBase.graph!

    return {
      projectId: knowledgeBase.projectId,
      status: graph.status,
      centerDocumentId: graph.centerDocumentId,
      nodes: graph.nodes.map((node) => ({
        id: node.id,
        title: node.title,
        sourcePath: node.sourcePath,
        sourceType: node.sourceType,
        isCenter: node.isCenter,
        relationCount: node.relationCount,
      })),
      edges: graph.edges.map((edge) => ({
        id: edge.id,
        source: edge.source,
        target: edge.target,
        kind: edge.kind,
        score: edge.score,
        relationType: edge.relationType,
        evidence: {
          sourceChunkId: edge.evidence.sourceChunkId,
          targetChunkId: edge.evidence.targetChunkId,
          sourceBlockStart: edge.evidence.sourceBlockStart,
          sourceBlockEnd: edge.evidence.sourceBlockEnd,
          targetBlockStart: edge.evidence.targetBlockStart,
          targetBlockEnd: edge.evidence.targetBlockEnd,
          excerpt: edge.evidence.excerpt,
          targetExcerpt: edge.evidence.targetExcerpt,
        },
      })),
      meta: {
        totalDocuments: graph.meta.totalDocuments,
        eligibleDocuments: graph.meta.eligibleDocuments,
        returnedDocuments: graph.meta.returnedDocuments,
        truncated: graph.meta.truncated,
        omittedDocuments: graph.meta.omittedDocuments,
        semantic: {
          strategy: graph.meta.semantic.strategy,
          sampledChunksPerDocument: graph.meta.semantic.sampledChunksPerDocument,
          minSimilarity: graph.meta.semantic.minSimilarity,
          available: graph.meta.semantic.available,
        },
        warnings: [...graph.meta.warnings],
      },
    }
  }
}
