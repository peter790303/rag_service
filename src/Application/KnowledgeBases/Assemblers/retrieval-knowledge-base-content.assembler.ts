import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type {
  KnowledgeBaseRelationResolution,
  KnowledgeBaseRetrievalState,
  KnowledgeBaseRetrievalMatch,
  KnowledgeBaseRetrievalDocument,
} from '../../../Domain/KnowledgeBase/ValueObjects/knowledge-base-retrieval.ts'
import type { RankedCandidate } from '../Types/ranked-candidate.ts'
import type { HybridChunkCandidate, RetrievalChunk } from '../Types/retrieval-chunk.ts'
import type { RetrievalMembership, RetrievalSnapshot } from '../Types/retrieval-snapshot.ts'

export interface RetrievalKnowledgeBaseContentAssemblerInput {
  snapshot: RetrievalSnapshot
  chunkCountsByDocumentIndexId: Record<string, number>
  requiredMembers: RetrievalMembership[]
  rankedChunks: (RankedCandidate<RetrievalChunk> & { isEffective: boolean; isMandatoryContext: boolean })[]
  vectorRanked: HybridChunkCandidate[]
  lexicalRanked: HybridChunkCandidate[]
  neighboringChunksById: Map<string, { previousChunk: RetrievalChunk | null; nextChunk: RetrievalChunk | null }>
  relationResolutionById: Map<string, KnowledgeBaseRelationResolution>
}

/** Joins already-selected entities and evidence; no eligibility or ranking policy. */
export class RetrievalKnowledgeBaseContentAssembler {
  static toRetrievalEvidence(
    facts: RetrievalKnowledgeBaseContentAssemblerInput,
    queryVector: readonly number[],
    queryText: string,
  ): KnowledgeBaseRetrievalState {
    const documentsById = new Map(facts.snapshot.documents.map((document) => [document.id, document]))
    const indexesById = new Map(facts.snapshot.indexes.map((index) => [index.id, index]))
    const revisionsById = new Map(facts.snapshot.revisions.map((revision) => [revision.id, revision]))
    const membershipsByDocumentId = new Map(
      facts.snapshot.memberships.map((membership) => [membership.documentId, membership]),
    )
    const semanticByChunkId = new Map(facts.vectorRanked.map((candidate) => [candidate.chunk.id, candidate]))
    const lexicalByChunkId = new Map(facts.lexicalRanked.map((candidate) => [candidate.chunk.id, candidate]))
    const relationsBySourceIndexId = facts.snapshot.relations.reduce((grouped, relation) => {
      const relations = grouped.get(relation.sourceIndexId) ?? []
      relations.push(relation)
      grouped.set(relation.sourceIndexId, relations)

      return grouped
    }, new Map<string, DocumentRelation[]>())
    const documentFacts = (indexId: string): KnowledgeBaseRetrievalDocument => {
      const index = indexesById.get(indexId)!

      return {
        index,
        document: documentsById.get(index.documentId)!,
        revision: revisionsById.get(index.revisionId)!,
        membership: membershipsByDocumentId.get(index.documentId)!,
      }
    }
    const matches = facts.rankedChunks.map(
      ({ candidate: chunk, score, rank, isEffective, isMandatoryContext }): KnowledgeBaseRetrievalMatch => {
        const document = documentFacts(chunk.documentIndexId)
        const neighbors = facts.neighboringChunksById.get(chunk.id)
        const semantic = semanticByChunkId.get(chunk.id)
        const lexical = lexicalByChunkId.get(chunk.id)
        const relations = (relationsBySourceIndexId.get(chunk.documentIndexId) ?? []).map((relation) => ({
          relation,
          sourceDocument: document.document,
          resolution: facts.relationResolutionById.get(relation.id)!,
        }))

        return {
          ...document,
          chunk,
          score,
          rank,
          isEffective,
          isMandatoryContext,
          totalChunks: facts.chunkCountsByDocumentIndexId[chunk.documentIndexId]!,
          previousChunk: neighbors?.previousChunk ?? null,
          nextChunk: neighbors?.nextChunk ?? null,
          semanticRank: semantic?.semanticRank ?? null,
          rawSemanticScore: semantic?.semanticScore ?? null,
          lexicalRank: lexical?.lexicalRank ?? null,
          rawLexicalScore: lexical?.lexicalScore ?? null,
          relations,
        }
      },
    )

    return {
      queryVector,
      queryText,
      matches,
      requiredDocuments: facts.requiredMembers.map((member) => documentFacts(member.activeDocumentIndexId!)),
    }
  }
}
