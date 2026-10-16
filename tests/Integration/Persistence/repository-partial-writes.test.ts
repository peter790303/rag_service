import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { PruningMembershipAssembler } from '../../../src/Application/Memberships/Assemblers/pruning-membership.assembler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document-membership.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { KnowledgeBaseDocumentMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document-membership.repository.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

test(
  'membership full writes preserve false and zero while a stale detach preserves later configuration writes',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const transaction = new PersistenceTransaction(dataSource)
    const repository = new KnowledgeBaseDocumentMembershipRepository(transaction)

    try {
      const key = randomUUID()
      const knowledgeBase = await dataSource.getRepository(KnowledgeBaseModel).save({
        projectId: `partial-writes-${key}`,
        projectName: 'partial writes',
      })
      const document = await dataSource.getRepository(DocumentModel).save({
        sourceType: DocumentSourceTypeEnum.REPOSITORY,
        sourceKey: key,
        sourcePath: 'partial-writes.md',
      })
      const revision = await dataSource.getRepository(DocumentRevisionModel).save({
        documentId: document.id,
        contentSha256: 'c'.repeat(64),
        title: null,
        content: 'partial writes',
      })
      const index = await dataSource.getRepository(DocumentIndexModel).save({
        documentId: document.id,
        revisionId: revision.id,
        pipelineHash: 'a'.repeat(64),
        chunkingModel: 'test-chunker',
        chunkingProfile: 'test',
        embeddingModel: 'test-embedding',
        embeddingDimensions: 384,
        embeddingProfile: 'test',
        lexicalProfile: 'test',
        relationProfile: 'test',
        status: DocumentIndexStatusEnum.BUILDING,
        readyAt: null,
        unreferencedSince: null,
      })
      const source = { knowledgeBaseId: knowledgeBase.id, documentId: document.id }
      await dataSource.getRepository(KnowledgeBaseDocumentMembershipModel).save({
        ...source,
        activeDocumentIndexId: index.id,
        requestedGeneration: '1',
        isEntry: true,
        alwaysIncludeFullContent: true,
      })

      await transaction.run(() =>
        repository.updateByKnowledgeBaseIdAndDocumentId({
          ...source,
          activeDocumentIndexId: null,
          requestedGeneration: '0',
          isEntry: false,
          alwaysIncludeFullContent: false,
          updatedAt: new Date(),
        }),
      )
      const resetMembership = await repository.findByKnowledgeBaseIdAndDocumentId(source)
      assert.ok(resetMembership)
      assert.equal(resetMembership.activeDocumentIndexId, null)
      assert.equal(resetMembership.requestedGeneration, '0')
      assert.equal(resetMembership.isEntry, false)
      assert.equal(resetMembership.alwaysIncludeFullContent, false)

      await transaction.run(() =>
        repository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId({
          ...source,
          activeDocumentIndexId: index.id,
          updatedAt: new Date(),
        }),
      )
      const snapshot = await repository.findByKnowledgeBaseIdAndDocumentId(source)
      assert.ok(snapshot)
      const detachedAt = new Date()
      const detachQO = PruningMembershipAssembler.toUpdateDetachedMembershipQO(snapshot.detachIndex(detachedAt))

      // A separate write commits after the pruning snapshot was read.
      await transaction.run(() =>
        repository.updateByKnowledgeBaseIdAndDocumentId({
          ...source,
          activeDocumentIndexId: index.id,
          requestedGeneration: '7',
          isEntry: true,
          alwaysIncludeFullContent: true,
          updatedAt: new Date(),
        }),
      )
      await transaction.run(() => repository.updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(detachQO))

      const detached = await repository.findByKnowledgeBaseIdAndDocumentId(source)
      assert.ok(detached)
      assert.equal(detached.activeDocumentIndexId, null)
      assert.equal(detached.requestedGeneration, '7')
      assert.equal(detached.isEntry, true)
      assert.equal(detached.alwaysIncludeFullContent, true)
      assert.equal(detached.updatedAt.isoString, detachedAt.toISOString())
    } finally {
      await cleanup()
    }
  },
)

test(
  'document source upserts retain persisted identity and creation time while applying explicit title operations',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, cleanup } = await createPersistenceTestDatabase()
    const transaction = new PersistenceTransaction(dataSource)
    const repository = new DocumentRepository(transaction)
    const source = {
      id: randomUUID(),
      sourceType: DocumentSourceTypeEnum.REPOSITORY,
      sourceKey: randomUUID(),
      sourcePath: 'title-semantics.md',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      unreferencedSince: null,
    }
    const repeatedSource = { ...source, id: randomUUID(), createdAt: new Date('2026-10-16T00:00:00.000Z') }

    try {
      const created = await transaction.run(() =>
        repository.upsertTitleBySourceTypeAndSourceKeyAndSourcePath({ ...source, currentTitle: 'Original title' }),
      )
      assert.equal(created.id, source.id)
      assert.deepEqual(created.createdAt.nativeDate, source.createdAt)
      const preserved = await transaction.run(() =>
        repository.upsertBySourceTypeAndSourceKeyAndSourcePath(repeatedSource),
      )
      assert.equal(preserved.id, created.id)
      assert.equal(preserved.createdAt.equals(created.createdAt), true)
      assert.equal(preserved.currentTitle, 'Original title')

      const cleared = await transaction.run(() =>
        repository.upsertTitleBySourceTypeAndSourceKeyAndSourcePath({ ...repeatedSource, currentTitle: null }),
      )
      assert.equal(cleared.id, created.id)
      assert.equal(cleared.createdAt.equals(created.createdAt), true)
      assert.equal(cleared.currentTitle, null)

      const empty = await transaction.run(() =>
        repository.upsertTitleBySourceTypeAndSourceKeyAndSourcePath({ ...repeatedSource, currentTitle: '' }),
      )
      assert.equal(empty.id, created.id)
      assert.equal(empty.createdAt.equals(created.createdAt), true)
      assert.equal(empty.currentTitle, '')
      assert.equal((await repository.upsertBySourceTypeAndSourceKeyAndSourcePath(source)).currentTitle, '')
    } finally {
      await cleanup()
    }
  },
)
