import type { RagDocumentIndexStatus } from '../../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import type { RagSourceTypeEnum } from '../../../../Domain/Knowledge/Enums/rag-source-type.enum.js'
import type { RagJobStatus } from '../../../../Domain/Knowledge/rag-job.js'
import type { RagKnowledgeBase } from '../../../../Domain/Knowledge/rag-knowledge-base.js'

export type RagIndexRequestPipeline = {
  contentSha256: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
}

export type RagIndexRequestIndex = {
  id: string
  documentId: string
  revisionId: string
  status: RagDocumentIndexStatus
}

export type RagIndexRequestMembership = {
  knowledgeBaseId: string
  documentId: string
  requestedGeneration: number
  activeDocumentIndexId: string | null
}

export type RagIndexRequestInitialMembershipState = {
  requestedGeneration: 0
  activeDocumentIndexId: null
  isEntry: false
  alwaysIncludeFullContent: false
}

export type RagIndexRequestJob = {
  id: string
  documentIndexId: string
  generation: number
  status: RagJobStatus
}

/** Transaction-scoped persistence operations; workflow and domain policy stay with the caller. */
export abstract class RagIndexRequestTransaction {
  abstract lockKnowledgeBase(knowledgeBaseId: string): Promise<RagKnowledgeBase | null>

  abstract createKnowledgeBase(knowledgeBase: RagKnowledgeBase): Promise<void>

  abstract saveKnowledgeBase(knowledgeBase: RagKnowledgeBase): Promise<void>

  abstract ensureSource(input: {
    sourceType: RagSourceTypeEnum
    sourceKey: string
    sourcePath: string
    currentTitle?: string | null
  }): Promise<{ documentId: string }>

  abstract lockDocument(documentId: string): Promise<boolean>

  abstract createMembershipIfMissing(input: {
    knowledgeBaseId: string
    documentId: string
    initialState: RagIndexRequestInitialMembershipState
  }): Promise<void>

  abstract lockMembership(knowledgeBaseId: string, documentId: string): Promise<RagIndexRequestMembership | null>

  abstract updateMembershipOptions(input: {
    knowledgeBaseId: string
    documentId: string
    isEntry?: boolean
    alwaysIncludeFullContent?: boolean
  }): Promise<void>

  abstract findOrCreateRevision(input: {
    documentId: string
    contentSha256: string
    title: string | null
    content: string
  }): Promise<{ revisionId: string }>

  abstract findOrCreateIndex(
    input: RagIndexRequestPipeline & {
      documentId: string
      revisionId: string
      initialState: {
        status: typeof import('../../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js').RAG_DOCUMENT_INDEX_STATUS.BUILDING
        readyAt: null
        unreferencedSince: null
      }
    },
  ): Promise<RagIndexRequestIndex>

  abstract lockCurrentJob(knowledgeBaseId: string, documentId: string): Promise<RagIndexRequestJob | null>

  abstract hasUnretriedFailure(input: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
  }): Promise<boolean>

  abstract lockIndexesById(documentIndexIds: string[]): Promise<RagIndexRequestIndex[]>

  abstract updateMembershipRequest(input: {
    knowledgeBaseId: string
    documentId: string
    requestedGeneration: number
    activeDocumentIndexId: string | null
  }): Promise<void>

  abstract removeCurrentJob(jobId: string): Promise<void>

  abstract enqueueJob(input: {
    knowledgeBaseId: string
    documentId: string
    documentIndexId: string
    generation: number
    status: RagJobStatus
    attempts: number
    availableAt: Date
    payload: Record<string, unknown>
  }): Promise<{ jobId: string }>

  abstract updateIndexUnreferencedSince(documentIndexId: string, value: Date | null): Promise<void>
}

/** Opens one database transaction and exposes only transaction-bound persistence operations. */
export abstract class RagIndexRequestTransactionRepository {
  abstract withTransaction<T>(operation: (transaction: RagIndexRequestTransaction) => Promise<T>): Promise<T>
}
