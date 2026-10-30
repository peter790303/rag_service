import type { Chunk } from '../../../Chunks/Domain/Entities/chunk.ts'
import type { DocumentIndex } from '../../../DocumentIndexes/Domain/Entities/document-index.ts'
import type { DocumentRelation } from '../../../DocumentRelations/Domain/Entities/document-relation.ts'
import type { DocumentRevision } from '../../../DocumentRevisions/Domain/Entities/document-revision.ts'
import type { Document } from '../../../Documents/Domain/Entities/document.ts'
import type { KnowledgeBaseDocument } from '../../../KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'
import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'

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
