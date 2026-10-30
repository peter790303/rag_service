import type { DocumentIndexExecutionRecordDTO } from './document-index-execution-record.dto.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'

export const DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS = {
  candidate: 'candidate',
  skip: 'skip',
} as const

export type DocumentIndexingClaimKnowledgeBaseDocumentDTO = {
  requestedGeneration: string
  activeDocumentIndexId: string | null
}

export type DocumentIndexingClaimExecutionDTO = Pick<
  DocumentIndexExecutionRecordDTO,
  'id' | 'knowledgeBaseId' | 'documentId' | 'documentIndexId' | 'generation' | 'attempts'
>

export type DocumentIndexExecutionSiblingLeaseDTO = { id: string; attempts: number; leaseExpiresAt: Date | null }

export type DocumentIndexingClaimCandidateDTO = {
  job: DocumentIndexingClaimExecutionDTO
  documentIndex: DocumentIndex | null
  previousDocumentIndex: DocumentIndex | null
  knowledgeBaseDocument: DocumentIndexingClaimKnowledgeBaseDocumentDTO | null
  runningSiblingLeases: readonly DocumentIndexExecutionSiblingLeaseDTO[]
}

export type DocumentIndexingClaimCandidateResultDTO =
  | {
      kind: typeof DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.candidate
      candidate: DocumentIndexingClaimCandidateDTO
    }
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.skip; documentIndexId: string }
  | null
