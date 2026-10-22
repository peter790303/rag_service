import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import { FindGraphChunkCandidatesUseCase } from '../../../src/Application/Chunks/UseCases/find-graph-chunk-candidates.use-case.ts'
import { LoadGraphChunksUseCase } from '../../../src/Application/Chunks/UseCases/load-graph-chunks.use-case.ts'
import { LoadRetrievalDocumentIndexesUseCase } from '../../../src/Application/DocumentIndexes/UseCases/load-retrieval-document-indexes.use-case.ts'
import { LoadRetrievalDocumentRelationsUseCase } from '../../../src/Application/DocumentRelations/UseCases/load-retrieval-document-relations.use-case.ts'
import { LoadRetrievalDocumentsUseCase } from '../../../src/Application/Documents/UseCases/load-retrieval-documents.use-case.ts'
import { LoadRetrievalKnowledgeBaseDocumentsUseCase } from '../../../src/Application/KnowledgeBaseDocuments/UseCases/load-retrieval-knowledge-base-documents.use-case.ts'
import type { KnowledgeBaseProjectQueryObject } from '../../../src/Application/KnowledgeBases/QueryObjects/knowledge-base.query-object.ts'
import { LoadKnowledgeGraphUseCase } from '../../../src/Application/KnowledgeBases/UseCases/load-knowledge-graph.use-case.ts'
import { DocumentSourceTypeEnum } from '../../../src/Domain/Document/Enums/document-source-type.enum.ts'
import { DocumentIndexStatusEnum } from '../../../src/Domain/DocumentIndex/Enums/document-index-status.enum.ts'
import { ChunkModel } from '../../../src/Infrastructure/Persistence/Models/chunk.model.ts'
import { DocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/document-index.model.ts'
import { DocumentRelationModel } from '../../../src/Infrastructure/Persistence/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/document-revision.model.ts'
import { DocumentModel } from '../../../src/Infrastructure/Persistence/Models/document.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base-document.model.ts'
import { KnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/knowledge-base.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { ChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/chunk.repository.ts'
import { DocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index.repository.ts'
import { DocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-relation.repository.ts'
import { DocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/document.repository.ts'
import { KnowledgeBaseDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base-document.repository.ts'
import { KnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/knowledge-base.repository.ts'
import { createPersistenceTestDatabase } from '../persistence-test-database.ts'

class SnapshotCheckingKnowledgeBaseRepository extends KnowledgeBaseRepository {
  constructor(private readonly transaction: PersistenceTransaction) {
    super(transaction)
  }

  override async findByProjectId(query: KnowledgeBaseProjectQueryObject) {
    const [settings] = await this.transaction.manager.query<{ readOnly: string; isolation: string }[]>(
      "SELECT current_setting('transaction_read_only') AS \"readOnly\", current_setting('transaction_isolation') AS isolation",
    )
    assert.deepEqual(settings, { readOnly: 'on', isolation: 'repeatable read' })

    return super.findByProjectId(query)
  }
}

test(
  'graph reads persisted active indexes in an isolated read-only snapshot with project and model boundaries',
  { skip: !process.env.RAG_DATABASE_URL },
  async () => {
    const { dataSource, retrievalDataSource, cleanup } = await createPersistenceTestDatabase()
    const transaction = new PersistenceTransaction(dataSource, retrievalDataSource)
    const chunks = new ChunkRepository(transaction, retrievalDataSource)
    const graphUseCase = new LoadKnowledgeGraphUseCase(
      transaction,
      new SnapshotCheckingKnowledgeBaseRepository(transaction),
      new LoadRetrievalKnowledgeBaseDocumentsUseCase(new KnowledgeBaseDocumentRepository(transaction)),
      new LoadRetrievalDocumentsUseCase(new DocumentRepository(transaction)),
      new LoadRetrievalDocumentIndexesUseCase(new DocumentIndexRepository(transaction)),
      new LoadRetrievalDocumentRelationsUseCase(new DocumentRelationRepository(transaction)),
      new LoadGraphChunksUseCase(chunks),
      new FindGraphChunkCandidatesUseCase(chunks),
    )
    try {
      const bases = dataSource.getRepository(KnowledgeBaseModel)
      const base = await bases.save(bases.create({ projectId: 'graph-project', projectName: 'Graph project' }))
      const other = await bases.save(bases.create({ projectId: 'private-project', projectName: 'Private project' }))
      const seed = async (path: string, knowledgeBaseId = base.id, model = 'persisted-old-model', ordinal = 0) => {
        const documents = dataSource.getRepository(DocumentModel)
        const document = await documents.save(
          documents.create({
            sourceType: DocumentSourceTypeEnum.REPOSITORY,
            sourceKey: 'graph-source',
            sourcePath: path,
            currentTitle: path,
            unreferencedSince: null,
          }),
        )
        const revisions = dataSource.getRepository(DocumentRevisionModel)
        const revision = await revisions.save(
          revisions.create({
            documentId: document.id,
            contentSha256: randomUUID().replaceAll('-', '').padEnd(64, '0'),
            title: path,
            content: `Persisted ${path}`,
          }),
        )
        const indexes = dataSource.getRepository(DocumentIndexModel)
        const index = await indexes.save(
          indexes.create({
            documentId: document.id,
            revisionId: revision.id,
            pipelineHash: randomUUID().replaceAll('-', '').padEnd(64, '0'),
            chunkingModel: 'old-chunker',
            chunkingProfile: 'old-chunk-profile',
            embeddingModel: model,
            embeddingDimensions: 384,
            embeddingProfile: 'old-embedding-profile',
            lexicalProfile: 'old-lexical-profile',
            relationProfile: 'old-relation-profile',
            status: DocumentIndexStatusEnum.READY,
            readyAt: new Date(),
            unreferencedSince: null,
          }),
        )
        const memberships = dataSource.getRepository(KnowledgeBaseDocumentModel)
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
        const chunkModels = dataSource.getRepository(ChunkModel)
        const chunk = await chunkModels.save(
          chunkModels.create({
            documentIndexId: index.id,
            ordinal,
            headingPath: [],
            content: `Vector evidence ${path}`,
            blockStart: ordinal,
            blockEnd: ordinal + 1,
            tokenCount: 3,
            embedding: [1, ...Array.from({ length: 383 }, () => 0)],
            searchVector: '',
          }),
        )

        return { document, index, chunk }
      }
      const center = await seed('docs/center.md')
      const related = await seed('docs/related.md')
      const late = await seed('docs/late.md', base.id, 'persisted-old-model', 8)
      const incompatible = await seed('docs/incompatible.md', base.id, 'different-model')
      const outside = await seed('private/secret.md', other.id)
      const relations = dataSource.getRepository(DocumentRelationModel)
      await relations.save([
        relations.create({
          sourceIndexId: center.index.id,
          targetDocumentId: null,
          targetReference: 'related.md',
          targetAnchor: null,
          relationType: 'markdown_link',
          evidenceBlockStart: 0,
          evidenceBlockEnd: 1,
          evidenceText: '[Related](related.md)',
        }),
        relations.create({
          sourceIndexId: center.index.id,
          targetDocumentId: outside.document.id,
          targetReference: 'private/secret.md',
          targetAnchor: null,
          relationType: 'requires',
          evidenceBlockStart: 1,
          evidenceBlockEnd: 2,
          evidenceText: 'Private reference must not be exposed',
        }),
      ])
      const overview = (await graphUseCase.execute({ projectId: base.projectId }))?.graph
      assert.ok(overview)
      assert.equal(overview.nodes.length, 4)
      assert.ok(overview.nodes.every((node) => node.id !== outside.document.id))
      assert.ok(overview.meta.warnings.includes('missing_chunks'))
      assert.ok(overview.meta.warnings.includes('incompatible_embedding_models'))
      assert.equal(overview.edges.filter((edge) => edge.kind === 'explicit').length, 1)
      assert.ok(
        overview.edges.every(
          (edge) => edge.source !== incompatible.document.id && edge.target !== incompatible.document.id,
        ),
      )
      const focus = (await graphUseCase.execute({ projectId: base.projectId, documentId: center.document.id }))?.graph
      assert.ok(focus)
      assert.deepEqual(
        new Set(focus.nodes.map((node) => node.id)),
        new Set([center.document.id, related.document.id, late.document.id]),
      )
      assert.ok(
        focus.edges.some(
          (edge) => edge.evidence.sourceChunkId === late.chunk.id || edge.evidence.targetChunkId === late.chunk.id,
        ),
      )
      assert.ok(focus.edges.every((edge) => !edge.evidence.excerpt.includes('Private')))
      const foreign = (await graphUseCase.execute({ projectId: base.projectId, documentId: outside.document.id }))
        ?.graph
      assert.equal(foreign?.status, 'document_not_found')
      assert.deepEqual(foreign?.nodes, [])
      const limited = (await graphUseCase.execute({ projectId: base.projectId, limit: 1 }))?.graph
      assert.equal(limited?.nodes.length, 1)
      assert.equal(limited?.meta.truncated, true)
      assert.equal(await graphUseCase.execute({ projectId: 'absent-project' }), null)
      assert.equal(await dataSource.getRepository(ChunkModel).count(), 5)
    } finally {
      await cleanup()
    }
  },
)
