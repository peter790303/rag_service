import assert from 'node:assert/strict'
import { test } from 'node:test'

import { LoadRetrievalDocumentIndexesUseCase } from '../../../src/Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import { LoadRetrievalDocumentRevisionsUseCase } from '../../../src/Application/DocumentRevisions/UseCases/load-retrieval-document-revisions.use-case.ts'
import { LoadRetrievalDocumentsUseCase } from '../../../src/Application/Documents/UseCases/load-retrieval-documents.use-case.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/load-retrieval-knowledge-base-documents.use-case.ts'
import type { KnowledgeBaseProjectQueryObject } from '../../../src/Application/KnowledgeBases/QueryObjects/knowledge-base.query-object.ts'
import { LoadIndexManifestUseCase } from '../../../src/Application/KnowledgeBases/UseCases/load-index-manifest.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import type { KnowledgeBase } from '../../../src/Domain/KnowledgeBase/knowledge-base.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-revision.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

class SnapshotCheckingKnowledgeBaseRepository extends KnowledgeBaseRepository {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly afterRead: () => Promise<void>,
  ) {
    super(transaction)
  }

  override async findByProjectId(
    knowledgeBaseProjectQO: KnowledgeBaseProjectQueryObject,
  ): Promise<KnowledgeBase | null> {
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
      const useCase = new LoadIndexManifestUseCase(
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
        new LoadRetrievalKnowledgeBaseDocumentsUseCase(new KnowledgeBaseDocumentRepository(transaction)),
        new LoadRetrievalDocumentsUseCase(new DocumentRepository(transaction)),
        new LoadRetrievalDocumentIndexesUseCase(new DocumentIndexRepository(transaction)),
        new LoadRetrievalDocumentRevisionsUseCase(new DocumentRevisionRepository(transaction)),
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
