import { resolve } from 'node:path'

import { ServiceConfigurationException } from '../src/Application/KnowledgeBases/Exceptions/service-configuration.exception.ts'

function invalidConfiguration(diagnostic: string): never {
  console.error(`[rag-config] ${diagnostic}`)
  throw new ServiceConfigurationException()
}

export interface KnowledgeServiceConfig {
  port: number
  databaseUrl: string
  databaseSchema: string
  embeddingTransport: 'local' | 'http'
  embeddingRevision: string
  embeddingCacheDir: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingApiUrl: string
  embeddingApiKey?: string
  chunkingTransport: 'host-cli' | 'http'
  chunkingCliPath: string
  chunkingCliMaxOutputBytes: number
  chunkingModel: string
  chunkingApiUrl: string
  chunkingApiKey?: string
  workerPollMs: number
  gcPollMs: number
  gcRetentionMs: number
  workerLeaseSeconds: number
  externalRequestTimeoutMs: number
  serviceAuthSecret: string
}

export const KNOWLEDGE_SERVICE_CONFIG = Symbol('RAG_CONFIG')

export interface KnowledgeDatabaseConfig {
  databaseUrl: string
  databaseSchema: string
}

export const loadKnowledgeDatabaseConfig = (env: NodeJS.ProcessEnv = process.env): KnowledgeDatabaseConfig => {
  const databaseUrl = env.RAG_DATABASE_URL?.trim()

  if (!databaseUrl) invalidConfiguration('RAG_DATABASE_URL is required')

  let parsedDatabaseUrl: URL
  try {
    parsedDatabaseUrl = new URL(databaseUrl)
  } catch {
    invalidConfiguration('RAG_DATABASE_URL must be a valid URL')
  }

  if (!['postgres:', 'postgresql:'].includes(parsedDatabaseUrl.protocol))
    invalidConfiguration('RAG_DATABASE_URL must use PostgreSQL')

  return { databaseUrl, databaseSchema: env.RAG_DB_SCHEMA?.trim() || 'public' }
}

const positiveInteger = (name: string, candidateValue: string | undefined, fallback: number): number => {
  const parsed = candidateValue === undefined || candidateValue === '' ? fallback : Number(candidateValue)

  if (!Number.isSafeInteger(parsed) || parsed <= 0) invalidConfiguration(`${name} must be a positive integer`)

  return parsed
}

export const loadKnowledgeServiceConfig = (env: NodeJS.ProcessEnv = process.env): KnowledgeServiceConfig => {
  const { databaseUrl, databaseSchema } = loadKnowledgeDatabaseConfig(env)
  const embeddingTransport = env.RAG_EMBEDDING_TRANSPORT?.trim() || 'local'

  if (embeddingTransport !== 'local' && embeddingTransport !== 'http')
    invalidConfiguration('RAG_EMBEDDING_TRANSPORT must be local or http')

  const embeddingModel = env.RAG_EMBEDDING_MODEL?.trim() || 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
  const embeddingRevision =
    env.RAG_EMBEDDING_REVISION?.trim() ||
    (embeddingModel === 'Xenova/paraphrase-multilingual-MiniLM-L12-v2'
      ? '2c4055b12046f11709e9df2c122e59ffbdc2f900'
      : '')

  if (embeddingTransport === 'local' && !embeddingRevision)
    invalidConfiguration('RAG_EMBEDDING_REVISION is required for a custom local model')

  if (
    embeddingTransport === 'local' &&
    (!/^[a-zA-Z0-9_-][a-zA-Z0-9_.-]*\/[a-zA-Z0-9_-][a-zA-Z0-9_.-]*$/.test(embeddingModel) ||
      !/^[a-zA-Z0-9_-]+$/.test(embeddingRevision))
  )
    invalidConfiguration('Local embedding model and revision must identify a cache directory safely')

  const embeddingApiUrl = env.RAG_EMBEDDING_API_URL?.trim() || ''

  if (embeddingTransport === 'http') {
    if (!embeddingApiUrl) invalidConfiguration('RAG_EMBEDDING_API_URL is required')

    let parsedEmbeddingApiUrl: URL
    try {
      parsedEmbeddingApiUrl = new URL(embeddingApiUrl)
    } catch {
      invalidConfiguration('RAG_EMBEDDING_API_URL must be a valid URL')
    }

    if (!['http:', 'https:'].includes(parsedEmbeddingApiUrl.protocol))
      invalidConfiguration('RAG_EMBEDDING_API_URL must use HTTP or HTTPS')
  }

  const chunkingTransport = env.RAG_CHUNKING_TRANSPORT?.trim() || 'host-cli'

  if (chunkingTransport !== 'host-cli' && chunkingTransport !== 'http')
    invalidConfiguration('RAG_CHUNKING_TRANSPORT must be host-cli or http')

  const chunkingApiUrl = env.RAG_CHUNKING_API_URL?.trim() || ''

  if (chunkingTransport === 'http') {
    if (!chunkingApiUrl) invalidConfiguration('RAG_CHUNKING_API_URL is required')

    let parsedChunkingApiUrl: URL
    try {
      parsedChunkingApiUrl = new URL(chunkingApiUrl)
    } catch {
      invalidConfiguration('RAG_CHUNKING_API_URL must be a valid URL')
    }

    if (!['http:', 'https:'].includes(parsedChunkingApiUrl.protocol)) {
      invalidConfiguration('RAG_CHUNKING_API_URL must use HTTP or HTTPS')
    }
  }

  const serviceAuthSecret = env.RAG_SERVICE_AUTH_SECRET?.trim() ?? ''

  if (serviceAuthSecret.length < 32) {
    invalidConfiguration('RAG_SERVICE_AUTH_SECRET must contain at least 32 characters')
  }

  return {
    port: positiveInteger('PORT', env.PORT, 30700),
    databaseUrl,
    databaseSchema,
    embeddingTransport,
    embeddingModel,
    embeddingRevision,
    embeddingCacheDir: resolve(env.RAG_EMBEDDING_CACHE_DIR?.trim() || '.cache/embeddings'),
    embeddingDimensions: positiveInteger('RAG_EMBEDDING_DIMENSIONS', env.RAG_EMBEDDING_DIMENSIONS, 384),
    embeddingApiUrl,
    ...(env.RAG_EMBEDDING_API_KEY ? { embeddingApiKey: env.RAG_EMBEDDING_API_KEY } : {}),
    chunkingTransport,
    chunkingCliPath: env.RAG_CHUNKING_CLI_PATH?.trim() || env.CODEX_CLI_PATH?.trim() || 'codex',
    chunkingCliMaxOutputBytes: positiveInteger(
      'RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES',
      env.RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES,
      4194304,
    ),
    chunkingModel: env.RAG_CHUNKING_MODEL?.trim() || 'gpt-6.1-sol',
    chunkingApiUrl,
    ...(env.RAG_CHUNKING_API_KEY ? { chunkingApiKey: env.RAG_CHUNKING_API_KEY } : {}),
    workerPollMs: positiveInteger('RAG_WORKER_POLL_MS', env.RAG_WORKER_POLL_MS, 1500),
    gcPollMs: positiveInteger('RAG_GC_POLL_MS', env.RAG_GC_POLL_MS, 60000),
    gcRetentionMs: positiveInteger('RAG_GC_RETENTION_MS', env.RAG_GC_RETENTION_MS, 86400000),
    workerLeaseSeconds: positiveInteger('RAG_JOB_LEASE_SECONDS', env.RAG_JOB_LEASE_SECONDS, 300),
    externalRequestTimeoutMs: positiveInteger(
      'RAG_EXTERNAL_REQUEST_TIMEOUT_MS',
      env.RAG_EXTERNAL_REQUEST_TIMEOUT_MS,
      30000,
    ),
    serviceAuthSecret,
  }
}
