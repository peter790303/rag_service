import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LoadRetrievalDocumentIndexesQueryHandler } from '../../../src/DocumentIndexes/Application/Queries/load-retrieval-document-indexes.query.handler.ts'
import { DocumentIndexStatusEnum } from '../../../src/DocumentIndexes/Domain/Enums/document-index-status.enum.ts'
import { DocumentIndexModel } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { DocumentIndexRepository } from '../../../src/DocumentIndexes/Infrastructure/Persistence/TypeORM/Repositories/document-index.repository.ts'
import { LoadRetrievalDocumentRevisionsQueryHandler } from '../../../src/DocumentRevisions/Application/Queries/load-retrieval-document-revisions.query.handler.ts'
import { DocumentRevisionModel } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentRevisionRepository } from '../../../src/DocumentRevisions/Infrastructure/Persistence/TypeORM/Repositories/document-revision.repository.ts'
import { LoadRetrievalDocumentsQueryHandler } from '../../../src/Documents/Application/Queries/load-retrieval-documents.query.handler.ts'
import { DocumentSourceTypeEnum } from '../../../src/Documents/Domain/Enums/document-source-type.enum.ts'
import { DocumentModel } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { DocumentRepository } from '../../../src/Documents/Infrastructure/Persistence/TypeORM/Repositories/document.repository.ts'
import { LoadRetrievalKnowledgeBaseDocumentsQueryHandler } from '../../../src/KnowledgeBaseDocuments/Application/Queries/load-retrieval-knowledge-base-documents.query.handler.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base-document.repository.ts'
import { LoadIndexManifestQueryHandler } from '../../../src/KnowledgeBases/Application/Queries/load-index-manifest.query.handler.ts'
import type { KnowledgeBaseProjectQO } from '../../../src/KnowledgeBases/Application/QueryObjects/knowledge-base.query-object.ts'
import type { KnowledgeBase } from '../../../src/KnowledgeBases/Domain/Entities/knowledge-base.ts'
import { KnowledgeBaseModel } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base.model.ts'
import { KnowledgeBaseRepository } from '../../../src/KnowledgeBases/Infrastructure/Persistence/TypeORM/Repositories/knowledge-base.repository.ts'
import { PersistenceTransaction } from '../../../src/Shared/Infrastructure/Persistence/TypeORM/persistence-transaction.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

class SnapshotCheckingKnowledgeBaseRepository extends KnowledgeBaseRepository {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly afterRead: () => Promise<void>,
  ) {
    super(transaction)
  }

  override async findByProjectId(knowledgeBaseProjectQO: KnowledgeBaseProjectQO): Promise<KnowledgeBase | null> {
    const knowledgeBase = await super.findByProjectId(knowledgeBaseProjectQO)
    const [settings] = await this.transaction.manager.query<{ readOnly: string; isolation: string }[]>(
      "SELECT current_setting('transaction_read_only') AS \"readOnly\", current_setting('transaction_isolation') AS isolation",
    )
    assert.deepEqual(settings, { readOnly: 'on', isolation: 'repeatable read' })
    await this.afterRead()

    return knowledgeBase
  }
}

test(
  'manifest reads persisted active revisions and profiles in one read-only snapshot despite a concurrent activation',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const transaction = new PersistenceTransaction(dataSource, retrievalDataSource)
    try {
      const bases = dataSource.getRepository(KnowledgeBaseModel)
      const base = await bases.save(bases.create({ projectId: 'manifest-project', projectName: 'Manifest project' }))
      const other = await bases.save(bases.create({ projectId: 'private-project', projectName: 'Private project' }))
      const documents = dataSource.getRepository(DocumentModel)
      const document = await documents.save(
        documents.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: 'manifest-source',
          sourcePath: 'docs/original.md',
          currentTitle: 'Original title',
          unreferencedSince: null,
        }),
      )
      const unindexed = await documents.save(
        documents.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: 'manifest-source',
          sourcePath: 'docs/unindexed.md',
          currentTitle: 'Unindexed',
          unreferencedSince: null,
        }),
      )
      const privateDocument = await documents.save(
        documents.create({
          sourceType: DocumentSourceTypeEnum.REPOSITORY,
          sourceKey: 'private-source',
          sourcePath: 'private/secret.md',
          currentTitle: 'Private title',
          unreferencedSince: null,
        }),
      )
      const revisions = dataSource.getRepository(DocumentRevisionModel)
      const revision = await revisions.save(
        revisions.create({
          documentId: document.id,
          contentSha256: 'a'.repeat(64),
          title: 'Original title',
          content: 'Private body',
        }),
      )
      const nextRevision = await revisions.save(
        revisions.create({
          documentId: document.id,
          contentSha256: 'b'.repeat(64),
          title: 'Next title',
          content: 'Next body',
        }),
      )
      const indexes = dataSource.getRepository(DocumentIndexModel)
      const indexFields = {
        documentId: document.id,
        revisionId: revision.id,
        pipelineHash: 'c'.repeat(64),
        chunkingModel: 'persisted-chunker',
        chunkingProfile: 'persisted-chunk-profile',
        embeddingModel: 'persisted-embedder',
        embeddingDimensions: 384,
        embeddingProfile: 'persisted-embed-profile',
        lexicalProfile: 'persisted-lexical-profile',
        relationProfile: 'persisted-relation-profile',
        status: DocumentIndexStatusEnum.READY,
        readyAt: new Date('2026-01-01T00:00:00.000Z'),
        unreferencedSince: null,
      }
      const index = await indexes.save(indexes.create(indexFields))
      const nextIndex = await indexes.save(
        indexes.create({
          ...indexFields,
          revisionId: nextRevision.id,
          pipelineHash: 'd'.repeat(64),
          embeddingProfile: 'next-profile',
        }),
      )
      const memberships = dataSource.getRepository(KnowledgeBaseDocumentModel)
      await memberships.save([
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: document.id,
          activeDocumentIndexId: index.id,
          requestedGeneration: '9007199254740993',
          isEntry: true,
          alwaysIncludeFullContent: true,
        }),
        memberships.create({
          knowledgeBaseId: base.id,
          documentId: unindexed.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
        memberships.create({
          knowledgeBaseId: other.id,
          documentId: privateDocument.id,
          activeDocumentIndexId: null,
          requestedGeneration: '1',
          isEntry: false,
          alwaysIncludeFullContent: false,
        }),
      ])
      let activate = true
      const useCase = new LoadIndexManifestQueryHandler(
        transaction,
        new SnapshotCheckingKnowledgeBaseRepository(transaction, async () => {
          if (!activate) return

          activate = false
          await memberships.update(
            { knowledgeBaseId: base.id, documentId: document.id },
            {
              activeDocumentIndexId: nextIndex.id,
              requestedGeneration: '9007199254740994',
            },
          )
          await documents.update({ id: document.id }, { currentTitle: 'Next title' })
        }),
        new LoadRetrievalKnowledgeBaseDocumentsQueryHandler(new KnowledgeBaseDocumentRepository(transaction)),
        new LoadRetrievalDocumentsQueryHandler(new DocumentRepository(transaction)),
        new LoadRetrievalDocumentIndexesQueryHandler(new DocumentIndexRepository(transaction)),
        new LoadRetrievalDocumentRevisionsQueryHandler(new DocumentRevisionRepository(transaction)),
      )
      const first = (await useCase.execute({ projectId: base.projectId }))!.indexManifest!
      assert.equal(first.documents.length, 2)
      assert.equal(first.readyDocuments, 1)
      assert.ok(!JSON.stringify(first).includes('Private'))
      const active = first.documents.find((entry) => entry.documentId === document.id)!
      assert.equal(active.title, 'Original title')
      assert.equal(active.requestedGeneration, '9007199254740993')
      assert.equal(active.activeDocumentIndexId, index.id)
      assert.equal(active.activeIndex?.revisionId, revision.id)
      assert.equal(active.activeIndex?.contentSha256, 'a'.repeat(64))
      assert.equal(active.activeIndex?.profile.embeddingProfile, 'persisted-embed-profile')
      assert.deepEqual(first.documents.find((entry) => entry.documentId === unindexed.id)?.issues, ['no_active_index'])
      const second = (await useCase.execute({ projectId: base.projectId }))!.indexManifest!
      const updated = second.documents.find((entry) => entry.documentId === document.id)!
      assert.equal(updated.title, 'Next title')
      assert.equal(updated.requestedGeneration, '9007199254740994')
      assert.equal(updated.activeIndex?.documentIndexId, nextIndex.id)
      assert.equal(updated.activeIndex?.revisionId, nextRevision.id)
      assert.equal(updated.activeIndex?.contentSha256, 'b'.repeat(64))
      assert.equal(updated.activeIndex?.profile.embeddingProfile, 'next-profile')
      assert.notEqual(first.activeIndexDigest, second.activeIndexDigest)
      assert.equal(
        (await useCase.execute({ projectId: base.projectId }))!.indexManifest!.activeIndexDigest,
        second.activeIndexDigest,
      )
    } finally {
      await cleanup()
    }
  },
)
