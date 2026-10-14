import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

import type { EntityManager } from 'typeorm'

import { RetrievalContextCriteriaAssembler } from '../../../src/Application/KnowledgeBases/Assemblers/retrieval-context-criteria.assembler.js'
import { EmbeddingProvider } from '../../../src/Application/KnowledgeBases/Contracts/embedding-provider.js'
import type { RagChunkRepositoryPort } from '../../../src/Application/KnowledgeBases/Contracts/rag-chunk-repository.port.js'
import type { RetrievalSnapshot } from '../../../src/Application/KnowledgeBases/Contracts/rag-retrieval-store.js'
import { RetrieveRagUseCase } from '../../../src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.js'
import { RAG_DOCUMENT_INDEX_STATUS } from '../../../src/Domain/Knowledge/Enums/rag-document-index-status.enum.js'
import { RagSourceTypeEnum } from '../../../src/Domain/Knowledge/Enums/rag-source-type.enum.js'
import { KnowledgeEmbeddingUnavailableException } from '../../../src/Domain/Knowledge/Exceptions/knowledge-embedding-unavailable.exception.js'
import {
  LEXICAL_PROFILE_VERSION,
  PersistenceRagLexicalSearchFormatter,
} from '../../../src/Infrastructure/Persistence/Formatters/rag-lexical-search.formatter.js'
import { RagChunkModel } from '../../../src/Infrastructure/Persistence/Models/rag-chunk.model.js'
import { RagDocumentIndexModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-index.model.js'
import { RagDocumentRevisionModel } from '../../../src/Infrastructure/Persistence/Models/rag-document-revision.model.js'
import { RagDocumentModel } from '../../../src/Infrastructure/Persistence/Models/rag-document.model.js'
import { RagFailedJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-failed-job.model.js'
import { RagJobModel } from '../../../src/Infrastructure/Persistence/Models/rag-job.model.js'
import { RagKnowledgeBaseModel } from '../../../src/Infrastructure/Persistence/Models/rag-knowledge-base.model.js'
import { RagMembershipModel } from '../../../src/Infrastructure/Persistence/Models/rag-membership.model.js'
import { TypeOrmRagChunkRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-chunk.repository.js'
import { TypeOrmRagDocumentIndexRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-index.repository.js'
import { TypeOrmRagDocumentRelationRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-relation.repository.js'
import { TypeOrmRagDocumentRevisionRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document-revision.repository.js'
import { TypeOrmRagDocumentRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-document.repository.js'
import { TypeOrmRagFailedJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-failed-job.repository.js'
import { TypeOrmRagJobClaimRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job-claim.repository.js'
import { TypeOrmRagJobRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-job.repository.js'
import { TypeOrmRagKnowledgeBaseRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-knowledge-base.repository.js'
import { TypeOrmRagMembershipRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag-membership.repository.js'
import { TypeOrmRagRepository } from '../../../src/Infrastructure/Persistence/Repositories/typeorm-rag.repository.js'
import { createTestDatabase } from '../test-database.js'

const loadCandidates = RetrieveRagUseCase.prototype['loadCandidates'].bind(RetrieveRagUseCase.prototype)
const selectRagRetrievalScope = RetrieveRagUseCase.prototype['selectScope'].bind(RetrieveRagUseCase.prototype)
const lexicalFormatter = new PersistenceRagLexicalSearchFormatter()
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

class TransactionInspectingKnowledgeBaseRepository extends TypeOrmRagKnowledgeBaseRepository {
  readonly settings: Array<{ isolation: string; readOnly: string }> = []

  override async findByProjectIdIn(manager: EntityManager, projectId: string) {
    const [setting] = await manager.query<Array<{ isolation: string; readOnly: string }>>(
      "SELECT current_setting('transaction_isolation') AS isolation, current_setting('transaction_read_only') AS \"readOnly\"",
    )
    assert.ok(setting)
    this.settings.push(setting)

    return super.findByProjectIdIn(manager, projectId)
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
        const content = sourcePath === 'docs/target.md' ? 'Target document content' : `Content from ${sourcePath}`
        const searchText = lexicalFormatter.format(content).searchText
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
            status: RAG_DOCUMENT_INDEX_STATUS.READY,
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
      const targetChunkId = await seedDocument('docs/target.md', targetVector)
      const otherProjectChunkId = await seedDocument('docs/other-project.md', queryVector, otherBase.id)
      const knowledgeBaseRepository = new TransactionInspectingKnowledgeBaseRepository(knowledgeBases)
      const repository = new TypeOrmRagRepository(
        indexes,
        new TypeOrmRagJobRepository(dataSource.getRepository(RagJobModel)),
        new TypeOrmRagMembershipRepository(memberships),
        new TypeOrmRagDocumentIndexRepository(indexes),
        knowledgeBaseRepository,
        new TypeOrmRagDocumentRepository(documents),
        new TypeOrmRagDocumentRevisionRepository(revisions),
        new TypeOrmRagFailedJobRepository(dataSource.getRepository(RagFailedJobModel)),
        new TypeOrmRagChunkRepository(),
        new TypeOrmRagDocumentRelationRepository(),
        new TypeOrmRagJobClaimRepository(dataSource.getRepository(RagJobModel)),
      )
      const input = { projectId, includeNonEffective: false, lexicalTerms: ['nomatch'] }
      const selectCandidates =
        (request: typeof input, vector: number[]) =>
        (chunks: RagChunkRepositoryPort, scope: { retrievalIndexIds: string[] }) =>
          loadCandidates(chunks, scope.retrievalIndexIds, vector, request.lexicalTerms, 1)
      const selectScope =
        (request: typeof input & { documentReference?: string }, vector: number[]) => (snapshot: RetrievalSnapshot) => {
          const scope = selectRagRetrievalScope({
            queryEmbedding: vector,
            queryEmbeddingModelId: new IntegrationEmbeddingProvider().modelId,
            lexicalProfileVersion: LEXICAL_PROFILE_VERSION,
            profiles,
            documentReference: request.documentReference,
            includeNonEffective: request.includeNonEffective ?? false,
            knowledgeBaseId: snapshot.knowledgeBaseId,
            memberships: snapshot.memberships,
            documents: snapshot.documents,
            indexes: snapshot.indexes,
            revisions: snapshot.revisions,
          })

          return {
            retrievalIndexIds: scope.retrievalIndexIds,
            relationTargetIndexIds: scope.relationTargetIndexIds,
            requiredIndexIds: scope.requiredIndexIds,
            value: scope,
          }
        }

      const unscoped = await repository.loadHybridSnapshot(
        input,
        selectScope(input, queryVector),
        selectCandidates(input, queryVector),
        (candidates) => RetrievalContextCriteriaAssembler.toQueryObject(candidates),
      )
      assert.deepEqual(
        unscoped.candidates.map((candidate) => candidate.chunk.id),
        [closerChunkId],
      )

      const scoped = await repository.loadHybridSnapshot(
        input,
        selectScope({ ...input, documentReference: 'docs/target.md' }, queryVector),
        selectCandidates(input, queryVector),
        (candidates) => RetrievalContextCriteriaAssembler.toQueryObject(candidates),
      )
      assert.deepEqual(
        scoped.candidates.map((candidate) => candidate.chunk.id),
        [targetChunkId],
      )
      const targetIndexId = scoped.candidates[0]?.chunk.documentIndexId
      const targetRevisionId = scoped.snapshot.indexes.find((index) => index.id === targetIndexId)?.revisionId
      assert.equal(
        scoped.snapshot.revisions.find((revision) => revision.id === targetRevisionId)?.title,
        'docs/target.md',
      )

      const lexicalInput = { ...input, lexicalTerms: ['target'] }
      const lexicalSnapshot = await repository.loadHybridSnapshot(
        lexicalInput,
        selectScope(lexicalInput, queryVector),
        selectCandidates(lexicalInput, queryVector),
        (candidates) => RetrievalContextCriteriaAssembler.toQueryObject(candidates),
      )
      const lexicalChunk = lexicalSnapshot.candidates.find((candidate) => candidate.chunk.id === targetChunkId)?.chunk
      assert.deepEqual(lexicalChunk?.embedding, targetVector)
      assert.deepEqual(lexicalChunk?.searchVector, ["'content' 'document' 'target'"])
      assert.ok(knowledgeBaseRepository.settings.length >= 3)
      assert.ok(
        knowledgeBaseRepository.settings.every(
          (setting) => setting.isolation === 'repeatable read' && setting.readOnly === 'on',
        ),
      )

      await assert.rejects(
        repository.loadHybridSnapshot(
          input,
          selectScope(input, [1, 0]),
          selectCandidates(input, [1, 0]),
          (candidates) => RetrievalContextCriteriaAssembler.toQueryObject(candidates),
        ),
        KnowledgeEmbeddingUnavailableException,
        'incompatible query dimensions must fail as a domain error before pgvector executes',
      )

      const otherProject = await repository.loadHybridSnapshot(
        { ...input, projectId: otherBase.projectId },
        selectScope({ ...input, projectId: otherBase.projectId }, queryVector),
        selectCandidates(input, queryVector),
        (candidates) => RetrievalContextCriteriaAssembler.toQueryObject(candidates),
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
