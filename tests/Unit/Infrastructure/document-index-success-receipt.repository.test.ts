import assert from 'node:assert/strict'
import test from 'node:test'
import 'reflect-metadata'

import { DataSource, type EntityManager, type FindOptionsWhere } from 'typeorm'

import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../config/knowledge-service.config.ts'
import type { ArchiveDocumentIndexSuccessQueryObject } from '../../../src/Application/DocumentIndexes/QueryObjects/document-index-success.query-object.ts'
import { InvalidDocumentIndexSuccessReceiptException } from '../../../src/Infrastructure/Persistence/Exceptions/invalid-document-index-success-receipt.exception.ts'
import { DocumentIndexSuccessReceiptModel } from '../../../src/Infrastructure/Persistence/Models/document-index-success-receipt.model.ts'
import { PersistenceTransaction } from '../../../src/Infrastructure/Persistence/persistence-transaction.ts'
import { DocumentIndexSuccessReceiptRepository } from '../../../src/Infrastructure/Persistence/Repositories/document-index-success-receipt.repository.ts'
import { PersistenceModule } from '../../../src/Infrastructure/Providers/persistence.module.ts'

type TypeOrmOptionsProvider = {
  inject?: unknown[]
  useFactory?: (serviceConfig: KnowledgeServiceConfig) => { entities?: unknown[] }
}

type DynamicModuleMetadata = {
  imports?: DynamicModuleMetadata[]
  providers?: TypeOrmOptionsProvider[]
}

const createRepositoryManagerStub = (): EntityManager => new DataSource({ type: 'postgres' }).manager

const successReceiptQuery: ArchiveDocumentIndexSuccessQueryObject = {
  projectId: 'env-smoke-20261018-dc8d4592',
  jobId: '6caa2a73-0360-4975-88bd-89d9df6a16ef',
  knowledgeBaseId: 'b610bd06-09e8-4e47-b836-0f4971af341f',
  documentId: 'b826bb9a-70e7-4c7a-9f47-49e0e468733a',
  documentIndexId: '4fd94e52-bc02-417a-8f51-9d4dc860efdc',
  generation: '9007199254740993',
  attempts: 2,
  executionVerification: { stage: 'VERIFYING', completedUnits: 4, totalUnits: 4 },
  completedAt: new Date('2026-10-18T12:00:00.000Z'),
}

test('success receipt archival stores the historical external project identity in the active transaction', async (context) => {
  const manager = createRepositoryManagerStub()
  const successReceiptModelRepository = manager.getRepository(DocumentIndexSuccessReceiptModel)
  const insertReceipt = context.mock.method(
    successReceiptModelRepository,
    'insert',
    async (receipt: Parameters<typeof successReceiptModelRepository.insert>[0]) => {
      assert.deepEqual(receipt, successReceiptQuery)

      return { identifiers: [], generatedMaps: [], raw: [] }
    },
  )
  const receiptRepository = new DocumentIndexSuccessReceiptRepository(new PersistenceTransaction(manager.connection))

  await receiptRepository.archiveSuccess(successReceiptQuery)

  assert.deepEqual(insertReceipt.mock.calls[0]?.arguments, [successReceiptQuery])
  assert.notEqual(insertReceipt.mock.calls[0]?.arguments[0], successReceiptQuery)
})

test('success receipt lookup requires both job and historical project identity', async (context) => {
  const manager = createRepositoryManagerStub()
  const successReceiptModelRepository = manager.getRepository(DocumentIndexSuccessReceiptModel)
  const projectId = successReceiptQuery.projectId
  const storedReceipt = Object.assign(new DocumentIndexSuccessReceiptModel(), {
    ...successReceiptQuery,
    projectId,
  })
  const findReceipt = context.mock.method(
    successReceiptModelRepository,
    'findOneBy',
    async (where: FindOptionsWhere<DocumentIndexSuccessReceiptModel>) =>
      where.jobId === successReceiptQuery.jobId && where.projectId === projectId ? storedReceipt : null,
  )
  const receiptRepository = new DocumentIndexSuccessReceiptRepository(new PersistenceTransaction(manager.connection))

  assert.equal(
    await receiptRepository.findSuccessByProjectIdAndJobId({
      projectId: 'another-project',
      jobId: successReceiptQuery.jobId,
    }),
    null,
  )
  const result = await receiptRepository.findSuccessByProjectIdAndJobId({
    projectId,
    jobId: successReceiptQuery.jobId,
  })

  assert.deepEqual(
    findReceipt.mock.calls.map((call) => call.arguments),
    [
      [{ projectId: 'another-project', jobId: successReceiptQuery.jobId }],
      [{ projectId, jobId: successReceiptQuery.jobId }],
    ],
  )
  assert.equal(result?.projectId, projectId)
  assert.equal(result?.generation, successReceiptQuery.generation)
  assert.notEqual(result?.completedAt, successReceiptQuery.completedAt)
  assert.notEqual(result?.executionVerification, successReceiptQuery.executionVerification)
})

test('production persistence data sources register the success receipt model', () => {
  const persistenceModuleImports = Reflect.getMetadata('imports', PersistenceModule) as DynamicModuleMetadata[]
  const productionDataSourceOptionsFactories = persistenceModuleImports
    .flatMap((moduleMetadata) => moduleMetadata.imports ?? [])
    .flatMap((moduleMetadata) => moduleMetadata.providers ?? [])
    .filter((provider) => provider.inject?.includes(KNOWLEDGE_SERVICE_CONFIG))
    .map((provider) => provider.useFactory)
    .filter(
      (useFactory): useFactory is NonNullable<TypeOrmOptionsProvider['useFactory']> => typeof useFactory === 'function',
    )
  const productionDataSourceOptions = productionDataSourceOptionsFactories.map((useFactory) =>
    useFactory({
      databaseUrl: 'postgres://localhost:5432/agent_teams_rag',
      databaseSchema: 'rag_success_receipt_test',
    } as KnowledgeServiceConfig),
  )

  assert.equal(productionDataSourceOptionsFactories.length, 2)
  assert.deepEqual(
    productionDataSourceOptions.map((dataSourceOptions) =>
      dataSourceOptions.entities?.includes(DocumentIndexSuccessReceiptModel),
    ),
    [true, true],
  )
})

test('receipt archive rejects absent or invalid successful execution facts before inserting', async (context) => {
  const manager = createRepositoryManagerStub()
  const insert = context.mock.method(manager.getRepository(DocumentIndexSuccessReceiptModel), 'insert')
  const repository = new DocumentIndexSuccessReceiptRepository(new PersistenceTransaction(manager.connection))
  const invalid = [
    { ...successReceiptQuery, attempts: null },
    { ...successReceiptQuery, completedAt: null },
    { ...successReceiptQuery, attempts: -1 },
    { ...successReceiptQuery, attempts: 5 },
    { ...successReceiptQuery, attempts: 1.5 },
    { ...successReceiptQuery, completedAt: new Date('invalid') },
  ]
  await Promise.all(
    invalid.map((receipt) =>
      assert.rejects(
        repository.archiveSuccess(receipt as ArchiveDocumentIndexSuccessQueryObject),
        InvalidDocumentIndexSuccessReceiptException,
      ),
    ),
  )
  assert.equal(insert.mock.calls.length, 0)
})

test('receipt archive propagates duplicate-key insert failure without overwriting retained audit facts', async (context) => {
  const manager = createRepositoryManagerStub()
  const modelRepository = manager.getRepository(DocumentIndexSuccessReceiptModel)
  const duplicate = Object.assign(new Error('duplicate receipt job ID'), { code: '23505' })
  const retained = Object.assign(new DocumentIndexSuccessReceiptModel(), structuredClone(successReceiptQuery))
  const insert = context.mock.method(modelRepository, 'insert', async () => {
    throw duplicate
  })
  context.mock.method(modelRepository, 'findOneBy', async () => retained)
  const save = context.mock.method(modelRepository, 'save', async () => {
    assert.fail('receipt archival must not update existing audit facts')
  })
  const repository = new DocumentIndexSuccessReceiptRepository(new PersistenceTransaction(manager.connection))

  await assert.rejects(
    repository.archiveSuccess({ ...successReceiptQuery, attempts: 3 }),
    (error) => error === duplicate,
  )

  assert.equal(insert.mock.calls.length, 1)
  assert.equal(save.mock.calls.length, 0)
  assert.deepEqual(
    await repository.findSuccessByProjectIdAndJobId({
      projectId: successReceiptQuery.projectId,
      jobId: successReceiptQuery.jobId,
    }),
    successReceiptQuery,
  )
})
