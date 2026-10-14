import { RagConfigurationException } from '../src/Domain/Knowledge/Exceptions/rag-configuration.exception.js'

function invalidConfiguration(diagnostic: string): never {
  console.error(`[rag-config] ${diagnostic}`)
  throw new RagConfigurationException()
}

export interface RagConfig {
  port: number
  databaseUrl: string
  databaseSchema: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingApiUrl: string
  embeddingApiKey?: string
  chunkingModel: string
  chunkingApiUrl: string
  chunkingApiKey?: string
  workerPollMs: number
  gcPollMs: number
  gcRetentionMs: number
  workerLeaseSeconds: number
  serviceAuthSecret: string
}

export const RAG_CONFIG = Symbol('RAG_CONFIG')

export interface RagDatabaseConfig {
  databaseUrl: string
  databaseSchema: string
}

export const loadRagDatabaseConfig = (env: NodeJS.ProcessEnv = process.env): RagDatabaseConfig => {
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

export const loadRagConfig = (env: NodeJS.ProcessEnv = process.env): RagConfig => {
  const { databaseUrl, databaseSchema } = loadRagDatabaseConfig(env)
  const embeddingApiUrl = env.RAG_EMBEDDING_API_URL?.trim()

  if (!embeddingApiUrl) invalidConfiguration('RAG_EMBEDDING_API_URL is required')

  let parsedEmbeddingApiUrl: URL
  try {
    parsedEmbeddingApiUrl = new URL(embeddingApiUrl)
  } catch {
    invalidConfiguration('RAG_EMBEDDING_API_URL must be a valid URL')
  }

  if (!['http:', 'https:'].includes(parsedEmbeddingApiUrl.protocol)) {
    invalidConfiguration('RAG_EMBEDDING_API_URL must use HTTP or HTTPS')
  }

  const chunkingApiUrl = env.RAG_CHUNKING_API_URL?.trim()

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

  const serviceAuthSecret = env.RAG_SERVICE_AUTH_SECRET?.trim() ?? ''

  if (serviceAuthSecret.length < 32) {
    invalidConfiguration('RAG_SERVICE_AUTH_SECRET must contain at least 32 characters')
  }

  return {
    port: positiveInteger('PORT', env.PORT, 30700),
    databaseUrl,
    databaseSchema,
    embeddingModel: env.RAG_EMBEDDING_MODEL?.trim() || 'Xenova/all-MiniLM-L6-v2',
    embeddingDimensions: positiveInteger('RAG_EMBEDDING_DIMENSIONS', env.RAG_EMBEDDING_DIMENSIONS, 384),
    embeddingApiUrl,
    ...(env.RAG_EMBEDDING_API_KEY ? { embeddingApiKey: env.RAG_EMBEDDING_API_KEY } : {}),
    chunkingModel: env.RAG_CHUNKING_MODEL?.trim() || 'gpt-6.1-sol',
    chunkingApiUrl,
    ...(env.RAG_CHUNKING_API_KEY ? { chunkingApiKey: env.RAG_CHUNKING_API_KEY } : {}),
    workerPollMs: positiveInteger('RAG_WORKER_POLL_MS', env.RAG_WORKER_POLL_MS, 1500),
    gcPollMs: positiveInteger('RAG_GC_POLL_MS', env.RAG_GC_POLL_MS, 60000),
    gcRetentionMs: positiveInteger('RAG_GC_RETENTION_MS', env.RAG_GC_RETENTION_MS, 86400000),
    workerLeaseSeconds: positiveInteger('RAG_JOB_LEASE_SECONDS', env.RAG_JOB_LEASE_SECONDS, 300),
    serviceAuthSecret,
  }
}
