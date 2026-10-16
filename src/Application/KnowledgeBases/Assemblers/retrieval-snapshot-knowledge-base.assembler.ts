import type { RetrievalSnapshot } from '../Types/retrieval-snapshot.ts'

export class RetrievalSnapshotKnowledgeBaseAssembler {
  static withRetrievalChunks(snapshot: RetrievalSnapshot, chunks: RetrievalSnapshot['chunks']): RetrievalSnapshot {
    return { ...snapshot, chunks }
  }

  static toRetrievalSnapshot(facts: Omit<RetrievalSnapshot, 'chunks' | 'lexicalCandidateChunkIds'>): RetrievalSnapshot {
    return { ...facts, chunks: [], lexicalCandidateChunkIds: [] }
  }
}
