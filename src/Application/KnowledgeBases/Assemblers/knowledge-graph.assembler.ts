import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type {
  KnowledgeGraphEdge,
  KnowledgeGraphNode,
} from '../../../Domain/KnowledgeBase/ValueObjects/knowledge-base-graph.ts'
import type { KnowledgeBaseProjectQueryObject } from '../QueryObjects/knowledge-base.query-object.ts'

export class KnowledgeGraphAssembler {
  static toKnowledgeBaseProjectQueryObject(projectId: string): KnowledgeBaseProjectQueryObject {
    return { projectId }
  }

  static toKnowledgeGraphNode(
    document: Document,
    centerDocumentId: string | null,
    relationCount: number,
  ): KnowledgeGraphNode {
    return {
      id: document.id,
      title: document.currentTitle ?? document.sourcePath,
      sourcePath: document.sourcePath,
      sourceType: document.sourceType,
      isCenter: document.id === centerDocumentId,
      relationCount,
    }
  }

  static toExplicitEdge(relation: DocumentRelation, source: string, target: string): KnowledgeGraphEdge {
    return {
      id: `explicit:${relation.id}`,
      source,
      target,
      kind: 'explicit',
      score: null,
      relationType: relation.relationType,
      evidence: {
        sourceChunkId: null,
        targetChunkId: null,
        sourceBlockStart: relation.evidenceBlockStart,
        sourceBlockEnd: relation.evidenceBlockEnd,
        targetBlockStart: null,
        targetBlockEnd: null,
        excerpt: relation.evidenceText.slice(0, 240),
        targetExcerpt: null,
      },
    }
  }

  static toSemanticEdge(
    source: string,
    target: string,
    sourceChunk: Chunk,
    targetChunk: Chunk,
    score: number,
  ): KnowledgeGraphEdge {
    return {
      id: `semantic:${source}:${target}`,
      source,
      target,
      kind: 'semantic',
      score,
      relationType: null,
      evidence: {
        sourceChunkId: sourceChunk.id,
        targetChunkId: targetChunk.id,
        sourceBlockStart: sourceChunk.blockStart,
        sourceBlockEnd: sourceChunk.blockEnd,
        targetBlockStart: targetChunk.blockStart,
        targetBlockEnd: targetChunk.blockEnd,
        excerpt: sourceChunk.content.slice(0, 240),
        targetExcerpt: targetChunk.content.slice(0, 240),
      },
    }
  }
}
