import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'

import { QueryFailedError } from 'typeorm'

import type { MarkdownChunkPlan } from '../../../src/Application/Chunks/DataTransferObjects/markdown-chunk-plan.dto.ts'
import { ReplaceIndexChunkUseCase } from '../../../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts'
import type { DocumentIndexingClaimDto } from '../../../src/Application/DocumentIndexes/DataTransferObjects/document-indexing-claim.dto.ts'
import { DocumentIndexExecutionStageEnum } from '../../../src/Application/DocumentIndexes/Enums/document-index-execution-stage.enum.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../../../src/Application/DocumentIndexes/Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { DocumentIndexChunkReplacementRequestedListener } from '../../../src/Application/DocumentIndexes/Listeners/document-index-chunk-replacement-requested.listener.ts'
import type { SavePlannedDocumentRelationsQueryObject } from '../../../src/Application/DocumentRelations/QueryObjects/document-relation.query-object.ts'
import { ReplacePlannedDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/replace-planned-document-relations.use-case.ts'
import { ReserveDocumentForIndexingUseCase } from '../../../src/Application/Documents/UseCases/reserve-document-for-indexing.use-case.ts'
import { ReserveMembershipForIndexingUseCase } from '../../../src/Application/Memberships/UseCases/reserve-membership-for-indexing.use-case.ts'
import { Chunk } from '../../../src/Domain/Chunk/chunk.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { MarkdownSourceAdapter } from '../../../src/Infrastructure/External/ChunkPlanning/Adapters/markdown-source.adapter.ts'
import { LexicalSearchQueryAdapter } from '../../../src/Infrastructure/Persistence/Adapters/lexical-search-query.adapter.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRelationModel } from '../../../src/Infrastructure/Persistence/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { JobModel } from '../../../src/Infrastructure/Persistence/Models/job.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { JobRepository } from '../../../src/Infrastructure/Persistence/Repositories/job.repository.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'
import { createMarkdownChunkPlan } from '../../Support/markdown-chunk-plan.fixture.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

const lexicalFormatter = new LexicalSearchQueryAdapter()
const replacementPlan: MarkdownChunkPlan = {
  chunks: [{ content: 'New replacement body', headingPath: ['New'], blockStart: 0, blockEnd: 2, tokenCount: 4 }],
  relations: [
    {
      targetReference: 'New.md',
      targetAnchor: null,
      relationType: 'wiki_link',
      evidenceBlockStart: 0,
      evidenceBlockEnd: 1,
      evidenceText: '[[New.md]]',
    },
  ],
}

/** Injects a real PostgreSQL CHECK failure after the replacement rows have been written. */
class ConstraintFailingRelationRepository extends DocumentRelationRepository {
  observedReplacement = false

  constructor(private readonly testTransaction: PersistenceTransaction) {
    super(testTransaction)
  }

  override async savePlanned(savePlannedDocumentRelationsQO: SavePlannedDocumentRelationsQueryObject): Promise<void> {
    const documentIndexId = savePlannedDocumentRelationsQO.relations[0]?.sourceIndexId
    assert.ok(documentIndexId)
    const manager = this.testTransaction.manager
    assert.equal(manager.queryRunner?.isTransactionActive, true)
    await super.savePlanned(savePlannedDocumentRelationsQO)
    const chunks = await manager.getRepository(ChunkModel).findBy({ documentIndexId })
    const documentRelationModelRepository = manager.getRepository(DocumentRelationModel)
    const writtenRelations = await documentRelationModelRepository.findBy({ sourceIndexId: documentIndexId })
    assert.deepEqual(
      chunks.map((chunk) => chunk.content),
      ['New replacement body'],
    )
    assert.deepEqual(
      writtenRelations.map((relation) => relation.targetReference),
      ['New.md'],
    )
    this.observedReplacement = true

    await documentRelationModelRepository.save(
      documentRelationModelRepository.create({
        sourceIndexId: documentIndexId,
        targetDocumentId: null,
        targetReference: 'Invalid.md',
        targetAnchor: null,
        relationType: 'wiki_link',
        evidenceBlockStart: -1,
        evidenceBlockEnd: 1,
        evidenceText: 'invalid evidence offset',
      }),
    )
  }
}

test(
  'replacement guards preserve persisted rows and a relation constraint failure rolls back all replacement writes',
  { skip: !process.env.RAG_DATABASE_URL },
  async (t) => {
    const { schema, dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const persistenceTransaction = new PersistenceTransaction(dataSource)
    try {
      assert.match(schema, /^test_[a-f0-9]+$/)
      assert.ok(dataSource.options.type === 'postgres')
      assert.equal(dataSource.options.schema, schema)
      const knowledgeBaseModelRepository = dataSource.getRepository(KnowledgeBaseModel)
      const documentModelRepository = dataSource.getRepository(DocumentModel)
      const documentRevisionModelRepository = dataSource.getRepository(DocumentRevisionModel)
      const documentIndexModelRepository = dataSource.getRepository(DocumentIndexModel)
      const membershipModelRepository = dataSource.getRepository(KnowledgeBaseDocumentMembershipModel)
      const jobModelRepository = dataSource.getRepository(JobModel)
      const chunkModelRepository = dataSource.getRepository(ChunkModel)
      const documentRelationModelRepository = dataSource.getRepository(DocumentRelationModel)
      const testKey = randomUUID()
      const base = await knowledgeBaseModelRepository.save(
        knowledgeBaseModelRepository.create({
          projectId: `replacement-${testKey}`,
          projectName: `replacement-${testKey}`,
        }),
      )
      const document = await documentModelRepository.save(
        documentModelRepository.create({
          sourceType: 'repository',
          sourceKey: testKey,
          sourcePath: `${testKey}.md`,
          unreferencedSince: null,
        }),
      )
      const revision = await documentRevisionModelRepository.save(
        documentRevisionModelRepository.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'replacement rollback',
          content: 'Original persisted body',
        }),
      )
      const index = await documentIndexModelRepository.save(
        documentIndexModelRepository.create({
          documentId: document.id,
          revisionId: revision.id,
          pipelineHash: 'b'.repeat(64),
          chunkingModel: 'test',
          chunkingProfile: 'test',
          embeddingModel: 'test',
          embeddingDimensions: 384,
          embeddingProfile: 'test',
          lexicalProfile: lexicalFormatter.format('original').profileVersion,
          relationProfile: 'test',
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
          unreferencedSince: null,
        }),
      )
      const membership = await membershipModelRepository.save(
        membershipModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      )
      const leaseToken = randomUUID()
      const leaseExpiresAt = new Date(Date.now() + 300_000)
      const verification = { claim_token: leaseToken, lease_expires_at: leaseExpiresAt.toISOString() }
      const jobRecord = await jobModelRepository.save(
        jobModelRepository.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          documentIndexId: index.id,
          generation: '1',
          status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
          attempts: 1,
          availableAt: new Date(),
          reservedAt: new Date(),
          leaseToken,
          leaseExpiresAt,
          idempotencyKey: null,
          retryOfFailedJobId: null,
          payload: {},
          executionState: null,
          executionVerification: verification,
        }),
      )
      const job: DocumentIndexingClaimDto = {
        id: jobRecord.id,
        knowledgeBaseId: base.id,
        documentId: document.id,
        documentIndexId: index.id,
        generation: '1',
        attempts: 1,
        leaseToken,
        leaseExpiresAt,
        executionVerification: {
          stage: DocumentIndexExecutionStageEnum.CLAIMED,
          completedUnits: 0,
          totalUnits: null,
          verifiedAt: null,
        },
      }
      await chunkModelRepository.save(
        chunkModelRepository.create({
          documentIndexId: index.id,
          ordinal: 0,
          headingPath: ['Original'],
          content: 'Original persisted body',
          blockStart: 0,
          blockEnd: 2,
          tokenCount: 4,
          embedding: Array.from({ length: 384 }, () => 0.25),
          searchVector: lexicalFormatter.format('original persisted body').searchText,
        }),
      )
      await documentRelationModelRepository.save(
        documentRelationModelRepository.create({
          sourceIndexId: index.id,
          targetDocumentId: null,
          targetReference: 'Original.md',
          targetAnchor: 'original-anchor',
          relationType: 'wiki_link',
          evidenceBlockStart: 0,
          evidenceBlockEnd: 1,
          evidenceText: '[[Original.md]]',
        }),
      )
      const originalChunks = await chunkModelRepository.findBy({ documentIndexId: index.id })
      const originalRelations = await documentRelationModelRepository.findBy({ sourceIndexId: index.id })
      const assertOriginalRows = async () => {
        assert.deepEqual(await chunkModelRepository.findBy({ documentIndexId: index.id }), originalChunks)
        assert.deepEqual(await documentRelationModelRepository.findBy({ sourceIndexId: index.id }), originalRelations)
        assert.equal(await chunkModelRepository.count(), 1)
        assert.equal(await documentRelationModelRepository.count(), 1)
      }
      const createUseCase = (relationRepository = new DocumentRelationRepository(persistenceTransaction)) =>
        new ReplaceIndexChunkUseCase(
          persistenceTransaction,
          new DocumentIndexChunkReplacementRequestedListener(
            new ReserveDocumentForIndexingUseCase(new DocumentRepository(persistenceTransaction)),
            new ReserveMembershipForIndexingUseCase(
              new KnowledgeBaseDocumentMembershipRepository(persistenceTransaction),
            ),
            new JobRepository(persistenceTransaction),
            new DocumentIndexRepository(persistenceTransaction),
          ),
          new ChunkRepository(persistenceTransaction, retrievalDataSource),
          new ReplacePlannedDocumentRelationsUseCase(relationRepository),
        )
      const replace = (useCase: ReplaceIndexChunkUseCase, claimedJob = job) =>
        useCase.execute({
          job: claimedJob,
          markdownChunkPlan: replacementPlan,
          chunkEmbeddings: [Array.from({ length: 384 }, () => 0.5)],
          now: new Date(),
        })

      await t.test('wrong claim token leaves old rows intact', async () => {
        await assert.rejects(
          replace(createUseCase(), { ...job, leaseToken: randomUUID() }),
          InvalidDocumentIndexExecutionLeaseException,
        )
        await assertOriginalRows()
      })
      await t.test('expired persisted lease leaves old rows intact', async () => {
        const expiredLeaseExpiresAt = new Date(Date.now() - 1_000)
        await jobModelRepository.update(job.id, {
          leaseExpiresAt: expiredLeaseExpiresAt,
          executionVerification: { ...verification, lease_expires_at: expiredLeaseExpiresAt.toISOString() },
        })
        await assert.rejects(replace(createUseCase()), InvalidDocumentIndexExecutionLeaseException)
        await assertOriginalRows()
        await jobModelRepository.update(job.id, { executionVerification: verification, leaseExpiresAt })
      })
      await t.test('superseded membership generation leaves old rows intact', async () => {
        await membershipModelRepository.update(
          { knowledgeBaseId: membership.knowledgeBaseId, documentId: membership.documentId },
          { requestedGeneration: '2' },
        )
        await assert.rejects(replace(createUseCase()), InvalidDocumentIndexExecutionLeaseException)
        await assertOriginalRows()
        await membershipModelRepository.update(
          { knowledgeBaseId: membership.knowledgeBaseId, documentId: membership.documentId },
          { requestedGeneration: '1' },
        )
      })
      await t.test('READY index remains immutable with a valid claim', async () => {
        const readyAt = new Date()
        await documentIndexModelRepository.update(index.id, { status: DocumentIndexStatusEnum.READY, readyAt })
        await replace(createUseCase())
        await assertOriginalRows()
        const readyIndex = await documentIndexModelRepository.findOneByOrFail({ id: index.id })
        assert.equal(readyIndex.status, DocumentIndexStatusEnum.READY)
        assert.deepEqual(readyIndex.readyAt, readyAt)
        await documentIndexModelRepository.update(index.id, {
          status: DocumentIndexStatusEnum.BUILDING,
          readyAt: null,
        })
      })
      await t.test('PostgreSQL relation CHECK failure restores old rows and removes partial new rows', async () => {
        const relationRepository = new ConstraintFailingRelationRepository(persistenceTransaction)
        await assert.rejects(replace(createUseCase(relationRepository)), (error: unknown) => {
          assert.ok(error instanceof QueryFailedError)
          assert.equal(error.driverError.code, '23514')

          return true
        })
        assert.equal(relationRepository.observedReplacement, true)
        await assertOriginalRows()
        const persistedIndex = await documentIndexModelRepository.findOneByOrFail({ id: index.id })
        assert.equal(persistedIndex.status, DocumentIndexStatusEnum.BUILDING)
        assert.equal(persistedIndex.readyAt, null)
      })
      await t.test('successful replacement persists new chunk identities and restores their source data', async () => {
        await replace(createUseCase())

        const persistedChunks = await chunkModelRepository.findBy({ documentIndexId: index.id })
        const restoredChunks = await new ChunkRepository(
          persistenceTransaction,
          retrievalDataSource,
        ).findByDocumentIndexId({ documentIndexId: index.id })
        const [persistedChunk] = persistedChunks
        assert.ok(persistedChunk)
        assert.match(persistedChunk.id, /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i)
        assert.notEqual(persistedChunk.id, originalChunks[0]?.id)
        assert.equal(persistedChunks.length, 1)
        const [restoredChunk] = restoredChunks
        assert.ok(restoredChunk)
        assert.ok(restoredChunk instanceof Chunk)
        restoredChunk.assertBelongsToDocumentIndex(index.id)
        assert.equal(restoredChunk.id, persistedChunk.id)
        assert.deepEqual(restoredChunk.embedding, persistedChunk.embedding)
        assert.equal(restoredChunk.searchVector, persistedChunk.searchVector)
        assert.deepEqual(restoredChunk.createdAt.nativeDate, persistedChunk.createdAt)
        assert.deepEqual(
          restoredChunks.map(
            ({ documentIndexId, ordinal, content, headingPath, blockStart, blockEnd, tokenCount }) => ({
              documentIndexId,
              ordinal,
              content,
              headingPath,
              blockStart,
              blockEnd,
              tokenCount,
            }),
          ),
          [{ documentIndexId: index.id, ordinal: 0, ...replacementPlan.chunks[0] }],
        )
        assert.deepEqual(
          {
            id: restoredChunk.id,
            documentIndexId: restoredChunk.documentIndexId,
            ordinal: restoredChunk.ordinal,
            headingPath: restoredChunk.headingPath,
            content: restoredChunk.content,
            blockStart: restoredChunk.blockStart,
            blockEnd: restoredChunk.blockEnd,
            tokenCount: restoredChunk.tokenCount,
            embedding: restoredChunk.embedding,
            searchVector: restoredChunk.searchVector,
            createdAt: restoredChunk.createdAt.nativeDate,
          },
          {
            id: persistedChunk.id,
            documentIndexId: persistedChunk.documentIndexId,
            ordinal: persistedChunk.ordinal,
            headingPath: persistedChunk.headingPath,
            content: persistedChunk.content,
            blockStart: persistedChunk.blockStart,
            blockEnd: persistedChunk.blockEnd,
            tokenCount: persistedChunk.tokenCount,
            embedding: persistedChunk.embedding,
            searchVector: persistedChunk.searchVector,
            createdAt: persistedChunk.createdAt,
          },
        )
        assert.deepEqual(
          (await documentRelationModelRepository.findBy({ sourceIndexId: index.id })).map((relation) => ({
            sourceIndexId: relation.sourceIndexId,
            targetReference: relation.targetReference,
            targetAnchor: relation.targetAnchor,
          })),
          [{ sourceIndexId: index.id, targetReference: 'New.md', targetAnchor: null }],
        )
        const persistedIndex = await documentIndexModelRepository.findOneByOrFail({ id: index.id })
        assert.equal(persistedIndex.status, DocumentIndexStatusEnum.BUILDING)
        assert.equal(persistedIndex.readyAt, null)
      })
      await t.test('skipped heading levels round-trip through replacement and ordered full-entity reads', async () => {
        const source = '## Claim concurrency\n#### Deep topic\n### Adjacent topic\n## Peer topic'
        const { blocks } = MarkdownSourceAdapter.scan(source)
        const markdownChunkPlan = createMarkdownChunkPlan(
          source,
          blocks.map((block) => block.id),
        )
        const expectedHeadingPaths = [
          ['Claim concurrency'],
          ['Claim concurrency', 'Deep topic'],
          ['Claim concurrency', 'Adjacent topic'],
          ['Peer topic'],
        ]
        const now = new Date()

        await createUseCase().execute({
          job: job,
          markdownChunkPlan,
          chunkEmbeddings: markdownChunkPlan.chunks.map(() => Array.from({ length: 384 }, () => 0.5)),
          now,
        })

        const persistedChunks = await chunkModelRepository.find({
          where: { documentIndexId: index.id },
          order: { ordinal: 'ASC' },
        })
        const restoredChunks = await new ChunkRepository(
          persistenceTransaction,
          retrievalDataSource,
        ).findByDocumentIndexIdsOrderByDocumentIndexIdAscAndOrdinalAsc({ documentIndexIds: [index.id] })

        assert.deepEqual(
          persistedChunks.map((chunk) => chunk.headingPath),
          expectedHeadingPaths,
        )
        assert.deepEqual(
          restoredChunks.map((chunk) => chunk.headingPath),
          expectedHeadingPaths,
        )
        assert.equal(restoredChunks.map((chunk) => chunk.content).join(''), source)
        assert.deepEqual(
          restoredChunks.map((chunk) => ({
            id: chunk.id,
            documentIndexId: chunk.documentIndexId,
            ordinal: chunk.ordinal,
            headingPath: chunk.headingPath,
            content: chunk.content,
            blockStart: chunk.blockStart,
            blockEnd: chunk.blockEnd,
            tokenCount: chunk.tokenCount,
            embedding: chunk.embedding,
            searchVector: chunk.searchVector,
            createdAt: chunk.createdAt.nativeDate,
          })),
          persistedChunks.map((chunk) => ({ ...chunk })),
        )
        assert.ok(
          restoredChunks.every(
            (chunk) => chunk instanceof Chunk && chunk.createdAt.epochMilliseconds === now.getTime(),
          ),
        )
      })
    } finally {
      await cleanup()
    }
  },
)
