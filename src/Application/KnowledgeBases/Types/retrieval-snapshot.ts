import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { Document } from '../../../Domain/Document/document.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { Membership } from '../../../Domain/Membership/membership.ts'

export type RetrievalMembership = Membership
export type RetrievalSnapshot = {
  knowledgeBase: KnowledgeBase | null
  knowledgeBaseId: string | null
  memberships: Membership[]
  documents: Document[]
  chunks: Chunk[]
  lexicalCandidateChunkIds: string[]
  indexes: DocumentIndex[]
  revisions: DocumentRevision[]
  relations: DocumentRelation[]
}
