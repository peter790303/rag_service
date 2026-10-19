import type { KnowledgeServiceConfig } from '../../config/knowledge-service.config.ts'

export const createKnowledgeServiceConfigFixture = (
  overrides: Partial<KnowledgeServiceConfig> = {},
): KnowledgeServiceConfig => ({
  port: 30700,
  databaseUrl: 'postgresql://unused@localhost/unused',
  databaseSchema: 'public',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
  embeddingTransport: 'http',
  embeddingRevision: '',
  embeddingCacheDir: '/unused',
  embeddingApiUrl: 'https://embedding.example.test',
  chunkingTransport: 'http',
  chunkingCliPath: 'codex',
  chunkingCliMaxOutputBytes: 4194304,
  chunkingModel: 'test-chunker',
  chunkingApiUrl: 'https://chunking.example.test',
  workerPollMs: 1000,
  gcPollMs: 1000,
  gcRetentionMs: 1000,
  workerLeaseSeconds: 300,
  externalRequestTimeoutMs: 30000,
  serviceAuthSecret: 'test-secret-long-enough-for-config',
  ...overrides,
})
