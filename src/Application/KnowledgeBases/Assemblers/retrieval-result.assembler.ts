import { RetrievalChunkViewAssembler } from './retrieval-chunk-view.assembler.js'
import { RetrievalFullContentDocumentAssembler } from './retrieval-full-content-document.assembler.js'
import { RetrievalNeighborViewAssembler } from './retrieval-neighbor-view.assembler.js'
import { RetrievalRelationViewAssembler } from './retrieval-relation-view.assembler.js'
import type {
  HybridCandidate,
  RetrievalChunk,
  RetrievalMembership,
  RetrievalSnapshot,
} from '../Contracts/rag-retrieval-store.js'
import type { RankedCandidate } from '../DataTransferObjects/rag.dto.js'
import type {
  RelationResolutionView,
  RetrievalFullContentDocumentView,
  RetrievalMatchView,
} from '../DataTransferObjects/retrieval-result.dto.js'

export interface RetrievalResultAssemblerInput {
  projectId: string
  snapshot: RetrievalSnapshot
  requiredMembers: RetrievalMembership[]
  rankedChunks: Array<RankedCandidate<RetrievalChunk> & { isEffective: boolean; isMandatoryContext: boolean }>
  vectorRanked: HybridCandidate[]
  lexicalRanked: HybridCandidate[]
  neighboringChunksById: Map<string, { previousChunk: RetrievalChunk | null; nextChunk: RetrievalChunk | null }>
  relationResolutionById: Map<string, RelationResolutionView>
}

export interface RetrievalResultAssemblerOutput {
  matches: RetrievalMatchView[]
  fullContentDocuments: RetrievalFullContentDocumentView[]
}

/** Maps selected retrieval facts to response DTOs; selection and eligibility are decided upstream. */
export class RetrievalResultAssembler {
  static toViewModel(input: RetrievalResultAssemblerInput): RetrievalResultAssemblerOutput {
    const documentsById = new Map(input.snapshot.documents.map((document) => [document.id, document]))
    const indexesById = new Map(input.snapshot.indexes.map((index) => [index.id, index]))
    const revisionsById = new Map(input.snapshot.revisions.map((revision) => [revision.id, revision]))
    const semanticByChunkId = new Map(
      input.vectorRanked.map(({ chunk, semanticScore, semanticRank }) => [
        chunk.id,
        { rank: semanticRank, score: semanticScore },
      ]),
    )
    const lexicalByChunkId = new Map(
      input.lexicalRanked.map(({ chunk, lexicalScore, lexicalRank }) => [
        chunk.id,
        { rank: lexicalRank, score: lexicalScore },
      ]),
    )
    const relationsBySourceIndexId = input.snapshot.relations.reduce((grouped, relation) => {
      const relations = grouped.get(relation.sourceIndexId) ?? []
      relations.push(relation)
      grouped.set(relation.sourceIndexId, relations)

      return grouped
    }, new Map<string, RetrievalSnapshot['relations']>())

    return {
      matches: input.rankedChunks.map((rankedChunk) =>
        this.assembleMatch(rankedChunk, input, {
          documentsById,
          indexesById,
          revisionsById,
          semanticByChunkId,
          lexicalByChunkId,
          relationsBySourceIndexId,
        }),
      ),
      fullContentDocuments: this.assembleFullContentDocuments(input, documentsById, indexesById, revisionsById),
    }
  }

  private static assembleMatch(
    rankedChunk: RetrievalResultAssemblerInput['rankedChunks'][number],
    input: RetrievalResultAssemblerInput,
    lookups: {
      documentsById: Map<string, RetrievalSnapshot['documents'][number]>
      indexesById: Map<string, RetrievalSnapshot['indexes'][number]>
      revisionsById: Map<string, RetrievalSnapshot['revisions'][number]>
      semanticByChunkId: Map<string, { rank: number | null; score: number }>
      lexicalByChunkId: Map<string, { rank: number | null; score: number }>
      relationsBySourceIndexId: Map<string, RetrievalSnapshot['relations']>
    },
  ): RetrievalMatchView {
    const { candidate: chunk, score, rank, isEffective, isMandatoryContext } = rankedChunk
    const index = lookups.indexesById.get(chunk.documentIndexId)!
    const document = lookups.documentsById.get(index.documentId)!
    const revision = lookups.revisionsById.get(index.revisionId)!
    const readyIndex = { ...index, readyAt: index.readyAt! }
    const totalChunks = input.snapshot.chunkCountsByIndexId[chunk.documentIndexId]!
    const neighbors = input.neighboringChunksById.get(chunk.id)
    const previousChunk = neighbors?.previousChunk ?? null
    const nextChunk = neighbors?.nextChunk ?? null

    return {
      chunk: RetrievalChunkViewAssembler.toViewModel({
        chunk,
        projectId: input.projectId,
        document,
        index: readyIndex,
        revision,
        totalChunks,
        isEffective,
        previousChunk,
        nextChunk,
      }),
      neighboringContext: {
        prevChunk: RetrievalNeighborViewAssembler.toViewModel(previousChunk),
        nextChunk: RetrievalNeighborViewAssembler.toViewModel(nextChunk),
      },
      matchType: 'hybrid',
      semanticRank: lookups.semanticByChunkId.get(chunk.id)?.rank ?? null,
      lexicalRank: lookups.lexicalByChunkId.get(chunk.id)?.rank ?? null,
      rawSemanticScore: lookups.semanticByChunkId.get(chunk.id)?.score ?? null,
      rawLexicalScore: lookups.lexicalByChunkId.get(chunk.id)?.score ?? null,
      relations: this.assembleRelations(chunk.documentIndexId, input, lookups),
      score,
      rank,
      isMandatoryContext,
    }
  }

  private static assembleRelations(
    sourceIndexId: string,
    input: RetrievalResultAssemblerInput,
    lookups: {
      documentsById: Map<string, RetrievalSnapshot['documents'][number]>
      indexesById: Map<string, RetrievalSnapshot['indexes'][number]>
      relationsBySourceIndexId: Map<string, RetrievalSnapshot['relations']>
    },
  ) {
    return (lookups.relationsBySourceIndexId.get(sourceIndexId) ?? []).map((relation) => {
      const sourceIndex = lookups.indexesById.get(relation.sourceIndexId)!
      const sourceDocument = lookups.documentsById.get(sourceIndex.documentId)!
      const resolution = input.relationResolutionById.get(relation.id)!

      return RetrievalRelationViewAssembler.toViewModel({ relation, sourceDocument, resolution })
    })
  }

  private static assembleFullContentDocuments(
    input: RetrievalResultAssemblerInput,
    documentsById: Map<string, RetrievalSnapshot['documents'][number]>,
    indexesById: Map<string, RetrievalSnapshot['indexes'][number]>,
    revisionsById: Map<string, RetrievalSnapshot['revisions'][number]>,
  ): RetrievalFullContentDocumentView[] {
    return input.requiredMembers.map((member) => {
      const index = indexesById.get(member.activeDocumentIndexId!)!
      const document = documentsById.get(member.documentId)!
      const revision = revisionsById.get(index.revisionId)!

      return RetrievalFullContentDocumentAssembler.toViewModel({
        projectId: input.projectId,
        document,
        revision: { ...revision, fullContent: revision.fullContent! },
      })
    })
  }
}
