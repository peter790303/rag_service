import type { DocumentReferenceQueries } from '../Contracts/rag-retention-operations.js'

export async function hasDocumentReferences(queries: DocumentReferenceQueries, documentId: string): Promise<boolean> {
  const references = [
    await queries.countMembershipsForDocument(documentId),
    await queries.countRevisionsForDocument(documentId),
    await queries.countIndexesForDocument(documentId),
    await queries.countJobsForDocument(documentId),
    await queries.countFailedJobsForDocument(documentId),
    await queries.countRelationsTargetingDocument(documentId),
  ]

  return references.some((count) => count > 0)
}
