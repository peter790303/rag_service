import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import { LEXICAL_PROFILE_VERSION } from '../../../src/Domain/Knowledge/ValueObjects/lexical-profile.js'
import { RagChunkModel } from '../../../src/Infrastructure/Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
import { RagDocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../../../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { RagKnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../../../src/Infrastructure/Persistence/Models/rag-membership.model.js'
import { TypeOrmRagMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-membership.repository.js'
import { createTestDatabase } from '../test-database.js'

class IntegrationEmbeddingProvider extends EmbeddingProvider {
  get modelId(): string {
    return 'test-model'
  }

  async embed(): Promise<number[][]> {
    return []
  }
}

test(
  'document reference restricts vector candidates before the retrieval limit',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createTestDatabase()

    try {
      const knowledgeBases = dataSource.getRepository(RagKnowledgeBaseModel)
      const documents = dataSource.getRepository(RagDocumentModel)
      const revisions = dataSource.getRepository(RagDocumentRevisionModel)
      const indexes = dataSource.getRepository(RagDocumentIndexModel)
      const memberships = dataSource.getRepository(RagMembershipModel)
      const chunks = dataSource.getRepository(RagChunkModel)
      const projectId = `retrieval-${randomUUID()}`
      const projectName = `Retrieval project ${randomUUID()}`
      const base = await knowledgeBases.save(knowledgeBases.create({ projectId, projectName }))
      const otherBase = await knowledgeBases.save(
        knowledgeBases.create({ projectId: `other-${projectId}`, projectName }),
      )
      const queryVector = [1, ...Array<number>(383).fill(0)]
      const targetVector = [0, 1, ...Array<number>(382).fill(0)]

      const seedDocument = async (sourcePath: string, embedding: number[], knowledgeBaseId = base.id) => {
        const document = await documents.save(
          documents.create({
            sourceType: RagSourceTypeEnum.REPOSITORY,
            sourceKey: projectId,
            sourcePath,
            currentTitle: sourcePath === 'docs/target.md' ? null : `Current ${sourcePath}`,
            unreferencedSince: null,
          }),
        )
        const revision = await revisions.save(
          revisions.create({
            documentId: document.id,
            contentSha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            title: sourcePath,
            content: `# ${sourcePath}`,
          }),
        )
        const index = await indexes.save(
          indexes.create({
            documentId: document.id,
            revisionId: revision.id,
            pipelineHash: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            chunkingModel: 'test-chunker',
            chunkingProfile: 'test',
            embeddingModel: 'test-model',
            embeddingDimensions: 384,
            embeddingProfile: 'test',
            lexicalProfile: LEXICAL_PROFILE_VERSION,
            relationProfile: 'test',
            status: 'ready',
            readyAt: new Date(),
            unreferencedSince: null,
          }),
        )
        await memberships.save(
          memberships.create({
            knowledgeBaseId,
            documentId: document.id,
            activeDocumentIndexId: index.id,
            requestedGeneration: '1',
            isEntry: false,
            alwaysIncludeFullContent: false,
          }),
        )
        const chunk = await chunks.save(
          chunks.create({
            documentIndexId: index.id,
            ordinal: 0,
            headingPath: [],
            content: sourcePath,
            blockStart: 0,
            blockEnd: 1,
            tokenCount: 1,
            embedding,
            searchVector: sourcePath,
          }),
        )

        return chunk.id
      }

      const closerChunkId = await seedDocument('docs/closer.md', queryVector)
      const targetChunkId = await seedDocument('docs/target.md', targetVector)
      const otherProjectChunkId = await seedDocument('docs/other-project.md', queryVector, otherBase.id)
      const repository = new TypeOrmRagMembershipRepository(memberships, new IntegrationEmbeddingProvider())
      const input = { projectId, queryText: 'nomatch' }
      const limits = { vectorLimit: 1, lexicalLimit: 1 }

      const unscoped = await repository.loadHybridSnapshot(input, queryVector, limits)
      assert.deepEqual(
        unscoped.candidates.map((candidate) => candidate.chunk.id),
        [closerChunkId],
      )

      const scoped = await repository.loadHybridSnapshot(
        { ...input, documentReference: 'docs/target.md' },
        queryVector,
        limits,
      )
      assert.deepEqual(
        scoped.candidates.map((candidate) => candidate.chunk.id),
        [targetChunkId],
      )
      const targetIndexId = scoped.candidates[0]?.chunk.documentIndexId
      const targetRevisionId = scoped.snapshot.indexes.find((index) => index.id === targetIndexId)?.revisionId
      assert.equal(scoped.snapshot.revisions.find((revision) => revision.id === targetRevisionId)?.title, null)

      await assert.rejects(
        repository.loadHybridSnapshot(input, [1, 0], limits),
        KnowledgeEmbeddingUnavailableException,
        'incompatible query dimensions must fail as a domain error before pgvector executes',
      )

      const otherProject = await repository.loadHybridSnapshot(
        { ...input, projectId: otherBase.projectId },
        queryVector,
        limits,
      )
      assert.deepEqual(
        otherProject.candidates.map((candidate) => candidate.chunk.id),
        [otherProjectChunkId],
        'knowledge bases with the same display name remain isolated by projectId',
      )
    } finally {
      await cleanup()
    }
  },
)
