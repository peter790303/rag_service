import type { DocumentIndexExecutionRecordDto } from './document-index-execution-record.dto.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'

export const DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS = {
  candidate: 'candidate',
  skip: 'skip',
} as const

export type DocumentIndexingClaimMembershipDto = {
  requestedGeneration: string
  activeDocumentIndexId: string | null
}

export type DocumentIndexingClaimExecutionDto = Pick<
  DocumentIndexExecutionRecordDto,
  'id' | 'knowledgeBaseId' | 'documentId' | 'documentIndexId' | 'generation' | 'attempts'
>

export type DocumentIndexExecutionSiblingLeaseDto = { id: string; attempts: number; leaseExpiresAt: Date | null }

export type DocumentIndexingClaimCandidateDto = {
  job: DocumentIndexingClaimExecutionDto
  documentIndex: DocumentIndex | null
  previousDocumentIndex: DocumentIndex | null
  membership: DocumentIndexingClaimMembershipDto | null
  runningSiblingLeases: readonly DocumentIndexExecutionSiblingLeaseDto[]
}

export type DocumentIndexingClaimCandidateResultDto =
  | {
      kind: typeof DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.candidate
      candidate: DocumentIndexingClaimCandidateDto
    }
  | { kind: typeof DOCUMENT_INDEXING_CLAIM_CANDIDATE_RESULT_KINDS.skip; documentIndexId: string }
  | null
