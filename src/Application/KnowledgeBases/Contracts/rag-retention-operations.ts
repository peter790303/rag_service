import type { RagDocumentIndexStatus } from '../../../Domain/Knowledge/Enums/rag-document-index-status.enum.js'

export type MembershipPruneRecord = {
  knowledgeBaseId: string
  documentId: string
}

export type LockedMembershipForPrune = {
  activeDocumentIndexId: string | null
}

export abstract class DocumentReferenceQueries {
  abstract countMembershipsForDocument(documentId: string): Promise<number>

  abstract countRevisionsForDocument(documentId: string): Promise<number>

  abstract countIndexesForDocument(documentId: string): Promise<number>

  abstract countJobsForDocument(documentId: string): Promise<number>

  abstract countFailedJobsForDocument(documentId: string): Promise<number>

  abstract countRelationsTargetingDocument(documentId: string): Promise<number>
}

export abstract class MembershipPruneTransaction extends DocumentReferenceQueries {
  abstract isKnowledgeBaseInProject(projectId: string, knowledgeBaseId: string): Promise<boolean>

  abstract findMembershipPruneRecords(knowledgeBaseId: string): Promise<MembershipPruneRecord[]>

  abstract lockDocumentForPrune(documentId: string): Promise<boolean>

  abstract lockMembershipForPrune(knowledgeBaseId: string, documentId: string): Promise<LockedMembershipForPrune | null>

  abstract clearActiveIndex(knowledgeBaseId: string, documentId: string): Promise<boolean>

  abstract markIndexUnreferenced(documentIndexId: string, unreferencedSince: Date): Promise<void>

  abstract removeMembership(knowledgeBaseId: string, documentId: string): Promise<boolean>

  abstract cancelJobsForDocument(knowledgeBaseId: string, documentId: string): Promise<string[]>

  abstract lockIndexForPrune(documentIndexId: string): Promise<boolean>

  abstract countMembershipsForIndex(documentIndexId: string): Promise<number>

  abstract countJobsForIndex(documentIndexId: string): Promise<number>

  abstract markDocumentUnreferenced(documentId: string, unreferencedSince: Date): Promise<void>
}

export type GarbageIndexCandidate = {
  documentIndexId: string
  documentId: string
  status: RagDocumentIndexStatus
  unreferencedSince: Date | null
  readyAt: Date | null
}

export type IndexRelationTarget = {
  documentIndexId: string
  documentId: string
}

export type GarbageFailedJobCandidate = {
  failedJobId: string
  documentId: string
  failedAt: Date
}

export type GarbageRevisionCandidate = {
  documentRevisionId: string
  documentId: string
  createdAt: Date
}

export type GarbageDocumentCandidate = {
  documentId: string
  unreferencedSince: Date | null
}

export abstract class GarbageCollectionTransaction extends DocumentReferenceQueries {
  abstract findGarbageFailedJobCandidates(cutoff: Date): Promise<GarbageFailedJobCandidate[]>

  abstract lockFailedJobForRetention(failedJobId: string): Promise<GarbageFailedJobCandidate | null>

  abstract countRetriesForFailedJob(failedJobId: string): Promise<number>

  abstract removeFailedJob(failedJobId: string): Promise<void>

  abstract findGarbageIndexCandidates(cutoff: Date): Promise<GarbageIndexCandidate[]>

  abstract findIndexRelationTargets(documentIndexIds: string[]): Promise<IndexRelationTarget[]>

  abstract lockGarbageIndex(documentIndexId: string): Promise<GarbageIndexCandidate | null>

  abstract countMembershipsForIndex(documentIndexId: string): Promise<number>

  abstract countJobsForIndex(documentIndexId: string): Promise<number>

  abstract countFailedJobsForIndex(documentIndexId: string): Promise<number>

  abstract removeRelationsForIndex(documentIndexId: string): Promise<void>

  abstract removeChunksForIndex(documentIndexId: string): Promise<void>

  abstract removeGarbageIndex(documentIndexId: string): Promise<void>

  abstract findGarbageRevisionCandidates(cutoff: Date): Promise<GarbageRevisionCandidate[]>

  abstract lockGarbageRevision(documentRevisionId: string): Promise<GarbageRevisionCandidate | null>

  abstract countIndexesForRevision(documentRevisionId: string): Promise<number>

  abstract removeGarbageRevision(documentRevisionId: string): Promise<void>

  abstract findGarbageDocumentCandidates(cutoff: Date): Promise<GarbageDocumentCandidate[]>

  abstract lockGarbageDocument(documentId: string): Promise<GarbageDocumentCandidate | null>

  abstract markDocumentUnreferenced(documentId: string, unreferencedSince: Date): Promise<void>

  abstract removeGarbageDocument(documentId: string): Promise<void>
}
