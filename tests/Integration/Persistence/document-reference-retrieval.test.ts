import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { QueryFailedError } from 'typeorm'

import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.ts'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Application/KnowledgeBases/Exceptions/knowledge-embedding-unavailable.exception.ts'
import type { KnowledgeBaseProjectQueryObject } from '../../../src/Application/KnowledgeBases/QueryObjects/knowledge-base.query-object.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import {
  LEXICAL_PROFILE_VERSION,
  LexicalSearchQueryAdapter,
} from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { FailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/failed-job.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { HybridKnowledgeRetrievalResource } from '../../../src/Interfaces/Http/Resources/hybrid-knowledge-retrieval.resource.ts'
import { DocumentIndexPersistenceFixture } from '../../Support/document-index-persistence.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const lexicalFormatter = new LexicalSearchQueryAdapter()
const profiles = {
  chunkingModel: 'test-chunker',
  chunkingProfile: 'test',
  embeddingProfile: 'test',
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: 'test',
}

class IntegrationEmbeddingProvider extends EmbeddingProvider {
  get modelId(): string {
    return 'test-model'
  }

  async embed(): Promise<number[][]> {
    return []
  }
}

class TransactionInspectingKnowledgeBaseRepository extends KnowledgeBaseRepository {
  readonly settings: {
    isolation: string
    readOnly: string
  }[] = []

  constructor(private readonly testTransaction: PersistenceTransaction) {
    super(testTransaction)
  }

  override async findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQueryObject) {
    const manager = this.testTransaction.manager
    const [setting] = await manager.query<
      {
        isolation: string
        readOnly: string
      }[]
    >(
      "SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS \"readOnly\"",
    )
    assert.ok(setting)
    this.settings.push(setting)

    return super.findByProjectId(knowledgeBaseProjectQO)
  }
}

test(
  'document reference restricts vector candidates before the retrieval limit',
  { skip: !process.env.RAG_DATABASE_URL },
  async (context) => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource, retrievalDataSource)

    try {
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const membershipModelRepository = dataSource.getRepository(KnowledgeBaseDocumentMembershipModel)
      const chunkModelRepository = dataSource.getRepository(ChunkModel)
      const projectId = `retrieval-${randomUUID()}`
      const projectName = `Retrieval project ${randomUUID()}`
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId, projectName }),
      )
      const otherBase = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({ projectId: `other-${projectId}`, projectName }),
      )
      const queryVector = [1, ...Array<number>(383).fill(0)]
      const targetVector = [0, 1, ...Array<number>(382).fill(0)]

      const seedDocument = async (sourcePath: string, embedding: number[], knowledgeBaseId = base.id) => {
        const content = sourcePath === 'docs/target.md' ? 'Target document content' : `Content from ${sourcePath}`
        const searchText = lexicalFormatter.format(content).searchText
        const document = await documentModelRepository.save(
          documentModelRepository.create({
            sourceType: DocumentSourceTypeEnum.REPOSITORY,
            sourceKey: projectId,
            sourcePath,
            currentTitle: sourcePath === 'docs/target.md' ? null : `Current ${sourcePath}`,
            unreferencedSince: null,
          }),
        )
        const revision = await documentRevisionModelRepository.save(
          documentRevisionModelRepository.create({
            documentId: document.id,
            contentSha256: randomUUID().replace(/-/g, '').padEnd(64, '0'),
            title: sourcePath,
            content: `# ${sourcePath}`,
          }),
        )
        const index = await documentIndexModelRepository.save(
          documentIndexModelRepository.create({
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
            status: DocumentIndexStatusEnum.READY,
            readyAt: new Date(),
            unreferencedSince: null,
          }),
        )
        await membershipModelRepository.save(
          membershipModelRepository.create({
            knowledgeBaseId,
            documentId: document.id,
            activeDocumentIndexId: index.id,
            requestedGeneration: '1',
            isEntry: false,
            alwaysIncludeFullContent: false,
          }),
        )
        const chunk = await chunkModelRepository.save(
          chunkModelRepository.create({
            documentIndexId: index.id,
            ordinal: 0,
            headingPath: [],
            content,
            blockStart: 0,
            blockEnd: 1,
            tokenCount: 1,
            embedding,
            searchVector: searchText,
          }),
        )

        return chunk.id
      }

      const closerChunkId = await seedDocument('docs/closer.md', queryVector)
      const closerChunk = await chunkModelRepository.findOneByOrFail({ id: closerChunkId })
      await chunkModelRepository.save(
        Array.from({ length: 20 }, (_, offset) =>
          chunkModelRepository.create({
            documentIndexId: closerChunk.documentIndexId,
            ordinal: offset + 100,
            headingPath: [],
            content: 'Additional closer candidate',
            blockStart: offset + 100,
            blockEnd: offset + 101,
            tokenCount: 1,
            embedding: [1, 0.1, ...Array<number>(382).fill(0)],
            searchVector: lexicalFormatter.format('Additional closer candidate').searchText,
          }),
        ),
      )
      const targetChunkId = await seedDocument('docs/target.md', targetVector)
      const otherProjectChunkId = await seedDocument('docs/other-project.md', queryVector, otherBase.id)
      const knowledgeBaseRepository = new TransactionInspectingKnowledgeBaseRepository(persistenceTransaction)
      const documentIndexPersistenceFixture = new DocumentIndexPersistenceFixture(
        persistenceTransaction,
        new JobRepository(persistenceTransaction),
        new KnowledgeBaseDocumentMembershipRepository(persistenceTransaction),
        new DocumentIndexRepository(persistenceTransaction),
        knowledgeBaseRepository,
        new DocumentRepository(persistenceTransaction),
        new DocumentRevisionRepository(persistenceTransaction),
        new FailedJobRepository(persistenceTransaction),
        new ChunkRepository(persistenceTransaction, retrievalDataSource),
        new DocumentRelationRepository(persistenceTransaction),
      )
      const retrievalSnapshotQO = { projectId, includeNonEffective: false, lexicalTerms: ['nomatch'] }
      const snapshot = await documentIndexPersistenceFixture.loadSnapshot(retrievalSnapshotQO, {
        snapshotLexicalLimit: 1,
        vectorCandidateLimit: 1,
        lexicalCandidateLimit: 1,
      })
      assert.equal(snapshot.knowledgeBaseId, base.id)
      assert.deepEqual(snapshot.documents.map((document) => document.sourcePath).sort(), [
        'docs/closer.md',
        'docs/target.md',
      ])

      await context.test('inverse membership relations retain knowledge-base and document scope', async () => {
        const scopedBase = await retrievalDataSource.getRepository(KnowledgeBaseModel).findOneOrFail({
          where: { projectId },
          relations: { memberships: { document: true } },
        })
        assert.deepEqual(scopedBase.memberships.map((membership) => membership.document.sourcePath).sort(), [
          'docs/closer.md',
          'docs/target.md',
        ])
        const scopedDocument = await retrievalDataSource.getRepository(DocumentModel).findOneOrFail({
          where: { sourceType: DocumentSourceTypeEnum.REPOSITORY, sourceKey: projectId, sourcePath: 'docs/target.md' },
          relations: { memberships: { knowledgeBase: true } },
        })
        assert.deepEqual(
          scopedDocument.memberships.map((membership) => membership.knowledgeBase.projectId),
          [projectId],
        )
        const otherScopedBase = await retrievalDataSource.getRepository(KnowledgeBaseModel).findOneOrFail({
          where: { projectId: otherBase.projectId },
          relations: { memberships: { document: true } },
        })
        assert.deepEqual(
          otherScopedBase.memberships.map((membership) => membership.document.sourcePath),
          ['docs/other-project.md'],
        )
      })

      await context.test('retrieval pool rejects native writes without affecting the writable pool', async () => {
        await assert.rejects(
          retrievalDataSource
            .getRepository(KnowledgeBaseModel)
            .update({ id: base.id }, { projectName: 'Forbidden write' }),
          (error: unknown) => {
            assert.ok(error instanceof QueryFailedError)
            assert.equal((error.driverError as { code?: string }).code, '25006')

            return true
          },
        )
        assert.equal((await knowledgeBaseModelRepository.findOneByOrFail({ id: base.id })).projectName, projectName)
      })
      const retrieval = documentIndexPersistenceFixture.createRetrievalUseCase(
        new IntegrationEmbeddingProvider(),
        profiles,
      )
      const request = {
        projectId,
        queryText: 'nomatch',
        queryVector,
        embeddingModelId: 'test-model',
        topK: 1,
      }
      const unscoped = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
        await retrieval.execute(request),
      )
      assert.deepEqual(
        unscoped.matches.map((match) => match.chunk.id),
        [closerChunkId],
      )

      const scoped = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
        await retrieval.execute({ ...request, documentReference: 'docs/target.md' }),
      )
      assert.deepEqual(
        scoped.matches.map((match) => match.chunk.id),
        [targetChunkId],
      )
      assert.equal(scoped.matches[0]?.chunk.documentTitle, 'docs/target.md')

      const lexicalSnapshot = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
        await retrieval.execute({ ...request, queryText: 'target', topK: 2 }),
      )
      const lexicalMatch = lexicalSnapshot.matches.find((match) => match.chunk.id === targetChunkId)
      assert.equal(lexicalMatch?.lexicalRank, 1)
      assert.deepEqual(lexicalMatch?.chunk.embeddingVector, targetVector)
      assert.deepEqual(lexicalMatch?.chunk.searchVector, ["'content' 'document' 'target'"])
      assert.ok(knowledgeBaseRepository.settings.length >= 4)
      assert.ok(
        knowledgeBaseRepository.settings.every(
          (setting) => setting.isolation === 'repeatable read' && setting.readOnly === 'on',
        ),
      )

      await assert.rejects(
        retrieval.execute({ ...request, queryVector: [1, 0] }),
        KnowledgeEmbeddingUnavailableException,
        'incompatible query dimensions must fail as a domain error before pgvector executes',
      )

      const otherProject = HybridKnowledgeRetrievalResource.toHybridKnowledgeRetrievalResource(
        await retrieval.execute({ ...request, projectId: otherBase.projectId }),
      )
      assert.deepEqual(
        otherProject.matches.map((match) => match.chunk.id),
        [otherProjectChunkId],
        'knowledge bases with the same display name remain isolated by projectId',
      )

      await context.test('neighbor queries keep each ordinal paired with its active index', async () => {
        const closer = await chunkModelRepository.findOneByOrFail({ id: closerChunkId })
        const target = await chunkModelRepository.findOneByOrFail({ id: targetChunkId })
        const other = await chunkModelRepository.findOneByOrFail({ id: otherProjectChunkId })
        const contextChunk = (documentIndexId: string, ordinal: number) =>
          chunkModelRepository.create({
            documentIndexId,
            ordinal,
            headingPath: [],
            content: `Neighbor ${ordinal}`,
            blockStart: ordinal,
            blockEnd: ordinal + 1,
            tokenCount: 1,
            embedding: queryVector,
            searchVector: lexicalFormatter.format(`Neighbor ${ordinal}`).searchText,
          })
        await chunkModelRepository.save([
          contextChunk(closer.documentIndexId, 1),
          contextChunk(closer.documentIndexId, 2),
          contextChunk(target.documentIndexId, 1),
          contextChunk(target.documentIndexId, 2),
          contextChunk(other.documentIndexId, 1),
        ])
        const chunkRepository = new ChunkRepository(persistenceTransaction, retrievalDataSource)
        const neighbors = await persistenceTransaction.bind(dataSource.manager, async () =>
          (
            await Promise.all([
              chunkRepository.findByDocumentIndexIdAndOrdinals({
                documentIndexId: closer.documentIndexId,
                ordinals: [1],
              }),
              chunkRepository.findByDocumentIndexIdAndOrdinals({
                documentIndexId: target.documentIndexId,
                ordinals: [2],
              }),
            ])
          ).flat(),
        )
        assert.deepEqual(
          neighbors.map((chunk) => `${chunk.documentIndexId}:${chunk.ordinal}`).sort(),
          [`${closer.documentIndexId}:1`, `${target.documentIndexId}:2`].sort(),
        )
        assert.deepEqual(
          await persistenceTransaction.bind(dataSource.manager, () =>
            chunkRepository.findByDocumentIndexIdAndOrdinals({
              documentIndexId: closer.documentIndexId,
              ordinals: [],
            }),
          ),
          [],
          'empty ordinals must not become an unfiltered find',
        )
      })
    } finally {
      await cleanup()
    }
  },
)
