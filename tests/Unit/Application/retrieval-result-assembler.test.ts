import assert from 'node:assert/strict'
import test from 'node:test'

import { testRetrievalProfiles } from './retrieve-rag.use-case.fixtures.js'
import { RetrievalResultAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/retrieval-result.assembler.js'
import type { RetrievalResultAssemblerInput } from '../../../src/Application/KnowledgeBases/Assemblers/retrieval-result.assembler.js'
import { ensureRetrievalResultRequirements } from '../../../src/Application/KnowledgeBases/Guards/retrieval-result.guard.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'

const createInput = (): RetrievalResultAssemblerInput => {
  const chunk = {
    id: 'chunk-1',
    documentIndexId: 'index-1',
    ordinal: 2,
    headingPath: ['Setup'],
    content: 'Install the package.',
    tokenCount: null,
    embedding: [0.25],
    searchVector: ['install'],
    blockStart: 4,
    blockEnd: 4,
  }
  const index = {
    id: 'index-1',
    documentId: 'document-1',
    revisionId: 'revision-1',
    ...testRetrievalProfiles,
    embeddingModel: 'embedding-v1',
    embeddingDimensions: 1,
    lexicalProfile: 'lexical-v1',
    readyAt: new Date('2026-10-01T00:00:00.000Z'),
  }

  return {
    projectId: 'project-1',
    snapshot: {
      knowledgeBaseId: 'kb-1',
      memberships: [],
      documents: [
        { id: 'document-1', sourcePath: 'guide.md', sourceKey: 'guide.md', sourceType: RagSourceTypeEnum.OBSIDIAN },
      ],
      chunks: [chunk],
      chunkCountsByIndexId: { 'index-1': 8 },
      lexicalCandidateChunkIds: [],
      indexes: [index],
      revisions: [{ id: 'revision-1', contentSha256: 'sha256:revision', title: 'Guide', fullContent: 'Guide content' }],
      relations: [],
    },
    requiredMembers: [
      {
        documentId: 'document-1',
        activeDocumentIndexId: 'index-1',
        isEntry: true,
        alwaysIncludeFullContent: true,
      },
    ],
    rankedChunks: [
      {
        candidate: chunk,
        score: 0.8,
        rank: 1,
        isEffective: true,
        isMandatoryContext: false,
      },
    ],
    vectorRanked: [],
    lexicalRanked: [],
    neighboringChunksById: new Map(),
    relationResolutionById: new Map(),
  }
}

test('retrieval result maps snapshot facts without inventing counts or token counts', () => {
  const result = RetrievalResultAssembler.toViewModel(createInput())

  assert.equal(result.matches[0]?.chunk.source, RagSourceTypeEnum.OBSIDIAN)
  assert.equal(result.matches[0]?.chunk.totalChunks, 8)
  assert.equal(result.matches[0]?.chunk.tokenCount, null)
  assert.equal(result.fullContentDocuments[0]?.content, 'Guide content')
})

test('retrieval result rejects a missing exact chunk count instead of deriving one from visible chunks', () => {
  const input = createInput()
  input.snapshot.chunkCountsByIndexId = {}

  assert.throws(() => ensureRetrievalResultRequirements(input), /missing an exact chunk count/)
})

test('retrieval result rejects a required document whose full content is missing', () => {
  const input = createInput()
  input.snapshot.revisions[0]!.fullContent = null

  assert.throws(() => ensureRetrievalResultRequirements(input), /missing required full-content facts/)
})

test('retrieval result preserves selected match order and required-document order', () => {
  const input = createInput()
  const secondChunk = {
    ...input.snapshot.chunks[0]!,
    id: 'chunk-2',
    ordinal: 3,
    content: 'Configure the package.',
  }
  const secondIndex = {
    ...input.snapshot.indexes[0]!,
    id: 'index-2',
    documentId: 'document-2',
    revisionId: 'revision-2',
  }
  const secondDocument = { ...input.snapshot.documents[0]!, id: 'document-2', sourcePath: 'reference.md' }
  const secondRevision = {
    ...input.snapshot.revisions[0]!,
    id: 'revision-2',
    title: 'Reference',
    contentSha256: 'sha256:reference',
    fullContent: 'Reference content',
  }

  input.snapshot.chunks.push(secondChunk)
  input.snapshot.indexes.push(secondIndex)
  input.snapshot.documents.push(secondDocument)
  input.snapshot.revisions.push(secondRevision)
  input.snapshot.chunkCountsByIndexId['index-2'] = 1
  input.requiredMembers.unshift({
    documentId: 'document-2',
    activeDocumentIndexId: 'index-2',
    isEntry: false,
    alwaysIncludeFullContent: true,
  })
  input.rankedChunks.unshift({
    candidate: secondChunk,
    score: 0.9,
    rank: 1,
    isEffective: false,
    isMandatoryContext: true,
  })

  const result = RetrievalResultAssembler.toViewModel(input)

  assert.deepEqual(
    result.matches.map(({ chunk }) => chunk.id),
    ['chunk-2', 'chunk-1'],
  )
  assert.deepEqual(
    result.fullContentDocuments.map(({ documentReference }) => documentReference),
    ['reference.md', 'guide.md'],
  )
})
