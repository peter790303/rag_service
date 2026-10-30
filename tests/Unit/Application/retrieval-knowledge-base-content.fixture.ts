import {
  createRetrievalSnapshotFixture,
  retrievalProfileFixtures,
} from './retrieve-knowledge-base-content.use-case.fixtures.ts'
import type { RetrievalKnowledgeBaseContentAssemblerInput } from '../../../src/KnowledgeBases/Application/Assemblers/retrieval-knowledge-base-content.assembler.ts'

export const createRetrievalKnowledgeBaseContentInputFixture = (): RetrievalKnowledgeBaseContentAssemblerInput => {
  const snapshot = createRetrievalSnapshotFixture({
    knowledgeBaseId: 'kb-1',
    knowledgeBaseDocuments: [
      { documentId: 'document-1', activeDocumentIndexId: 'index-1', isEntry: true, alwaysIncludeFullContent: true },
    ],
    documents: [
      {
        id: 'document-1',
        sourcePath: 'guide.md',
        sourceKey: 'guide.md',
        sourceType: 'obsidian',
        currentTitle: 'Newer document title',
      },
    ],
    chunks: [
      {
        id: 'chunk-1',
        documentIndexId: 'index-1',
        ordinal: 2,
        headingPath: ['Setup'],
        content: 'Install the package.',
        tokenCount: null,
        embedding: [0.25],
        searchVector: 'install',
        blockStart: 4,
        blockEnd: 4,
      },
    ],
    indexes: [
      {
        id: 'index-1',
        documentId: 'document-1',
        revisionId: 'revision-1',
        ...retrievalProfileFixtures,
        embeddingModel: 'embedding-v1',
        embeddingDimensions: 1,
        lexicalProfile: 'lexical-v1',
        readyAt: new Date('2026-10-01T00:00:00.000Z'),
      },
    ],
    revisions: [{ id: 'revision-1', title: 'Guide', content: 'Guide content' }],
    relations: [],
  })

  return {
    snapshot,
    chunkCountsByDocumentIndexId: { 'index-1': 8 },
    requiredMembers: [snapshot.knowledgeBaseDocuments[0]!],
    rankedChunks: [
      { candidate: snapshot.chunks[0]!, score: 0.8, rank: 1, isEffective: true, isMandatoryContext: true },
    ],
    vectorRanked: [],
    lexicalRanked: [],
    neighboringChunksById: new Map(),
    relationResolutionById: new Map(),
  }
}
