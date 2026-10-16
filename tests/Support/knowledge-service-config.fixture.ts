import type { KnowledgeServiceConfig } from '../../config/knowledge-service.config.ts'

export const createKnowledgeServiceConfigFixture = (
  overrides: Partial<KnowledgeServiceConfig> = {},
): KnowledgeServiceConfig => ({
  port: 30700,
  databaseUrl: 'postgresql://unused@localhost/unused',
  databaseSchema: 'public',
  embeddingModel: 'test-model',
  embeddingDimensions: 2,
  embeddingApiUrl: 'https://embedding.example.test',
  chunkingModel: 'test-chunker',
  chunkingApiUrl: 'https://chunking.example.test',
  workerPollMs: 1000,
  gcPollMs: 1000,
  gcRetentionMs: 1000,
  workerLeaseSeconds: 300,
  serviceAuthSecret: 'test-secret-long-enough-for-config',
  ...overrides,
})
