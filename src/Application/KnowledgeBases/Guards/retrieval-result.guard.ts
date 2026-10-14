import { KnowledgeRetrievalIncompleteException } from '../../../Domain/Knowledge/Exceptions/knowledge-retrieval-incomplete.exception.js'
import type { RetrievalResultAssemblerInput } from '../Assemblers/retrieval-result.assembler.js'

/** Enforces facts required by the retrieval response before presentation mapping begins. */
export const ensureRetrievalResultRequirements = (input: RetrievalResultAssemblerInput): void => {
  const indexesById = new Map(input.snapshot.indexes.map((index) => [index.id, index]))
  const documentsById = new Map(input.snapshot.documents.map((document) => [document.id, document]))
  const revisionsById = new Map(input.snapshot.revisions.map((revision) => [revision.id, revision]))
  const relationsBySourceIndexId = new Map<string, typeof input.snapshot.relations>()

  input.snapshot.relations.forEach((relation) => {
    const relations = relationsBySourceIndexId.get(relation.sourceIndexId) ?? []
    relations.push(relation)
    relationsBySourceIndexId.set(relation.sourceIndexId, relations)
  })

  input.rankedChunks.forEach(({ candidate: chunk }) => {
    const index = requireReadyIndex(indexesById.get(chunk.documentIndexId), chunk.documentIndexId)
    requireDocument(documentsById.get(index.documentId), index.documentId)
    const revision = requireRevision(revisionsById.get(index.revisionId), index.revisionId)
    requireRevisionIdentity(revision.contentSha256, index.revisionId)
    requireExactChunkCount(input.snapshot.chunkCountsByIndexId[chunk.documentIndexId], chunk)

    const relations = relationsBySourceIndexId.get(chunk.documentIndexId) ?? []
    relations.forEach((relation) => {
      const sourceIndex = requireSourceIndex(indexesById.get(relation.sourceIndexId), relation.id)
      requireSourceDocument(documentsById.get(sourceIndex.documentId), relation.id)
      requireRelationResolution(input.relationResolutionById.has(relation.id), relation.id)
    })
  })

  input.requiredMembers.forEach((member) => {
    const activeIndexId = requireActiveIndexId(member.activeDocumentIndexId, member.documentId)
    const index = requireReadyIndex(indexesById.get(activeIndexId), activeIndexId)
    requireMembershipIndexDocument(index.documentId === member.documentId, member.documentId, index.id)
    const document = requireDocument(documentsById.get(member.documentId), member.documentId)
    const revision = requireRevision(revisionsById.get(index.revisionId), index.revisionId)
    requireRevisionIdentity(revision.contentSha256, document.id)
    requireFullContent(revision.fullContent, document.id)
  })
}

const requireReadyIndex = <TIndex extends { readyAt: Date | null }>(
  index: TIndex | undefined,
  indexId: string,
): TIndex => {
  if (!index || !(index.readyAt instanceof Date) || !Number.isFinite(index.readyAt.getTime())) {
    throw new KnowledgeRetrievalIncompleteException(`Retrieval snapshot is missing a ready index ${indexId}`)
  }

  return index
}

const requireDocument = <TDocument>(document: TDocument | undefined, documentId: string): TDocument => {
  if (!document) {
    throw new KnowledgeRetrievalIncompleteException(`Retrieval snapshot is missing document ${documentId}`)
  }

  return document
}

const requireRevision = <TRevision>(revision: TRevision | undefined, revisionId: string): TRevision => {
  if (!revision) {
    throw new KnowledgeRetrievalIncompleteException(`Retrieval snapshot is missing revision ${revisionId}`)
  }

  return revision
}

const requireRevisionIdentity = (contentSha256: string, revisionId: string): void => {
  if (contentSha256.length === 0) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing revision content identity for ${revisionId}`,
    )
  }
}

const requireExactChunkCount = (
  totalChunks: number | undefined,
  chunk: RetrievalResultAssemblerInput['rankedChunks'][number]['candidate'],
): void => {
  if (typeof totalChunks !== 'number' || !Number.isSafeInteger(totalChunks) || totalChunks <= chunk.ordinal) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing an exact chunk count for index ${chunk.documentIndexId}`,
    )
  }
}

const requireSourceDocument = (document: unknown, relationId: string): void => {
  if (!document) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing source document for relation ${relationId}`,
    )
  }
}

const requireSourceIndex = <TIndex extends { documentId: string }>(
  index: TIndex | undefined,
  relationId: string,
): TIndex => {
  if (!index) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing source index for relation ${relationId}`,
    )
  }

  return index
}

const requireActiveIndexId = (indexId: string | null, documentId: string): string => {
  if (!indexId) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing an active index for required document ${documentId}`,
    )
  }

  return indexId
}

const requireMembershipIndexDocument = (matches: boolean, documentId: string, indexId: string): void => {
  if (!matches) {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot active index ${indexId} does not belong to required document ${documentId}`,
    )
  }
}

const requireRelationResolution = (hasResolution: boolean, relationId: string): void => {
  if (!hasResolution) {
    throw new KnowledgeRetrievalIncompleteException(`Retrieval result is missing resolution for relation ${relationId}`)
  }
}

const requireFullContent = (content: string | null, documentId: string): void => {
  if (typeof content !== 'string') {
    throw new KnowledgeRetrievalIncompleteException(
      `Retrieval snapshot is missing required full-content facts for document ${documentId}`,
    )
  }
}
