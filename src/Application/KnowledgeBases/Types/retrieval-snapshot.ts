import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'

export type RetrievalKnowledgeBaseDocument = KnowledgeBaseDocument
export type RetrievalSnapshot = {
  knowledgeBase: KnowledgeBase | null
  knowledgeBaseId: string | null
  knowledgeBaseDocuments: KnowledgeBaseDocument[]
  documents: Document[]
  chunks: Chunk[]
  indexes: DocumentIndex[]
  revisions: DocumentRevision[]
  relations: DocumentRelation[]
}
