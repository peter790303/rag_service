import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../../config/chunk-planning-profile.config.ts'
import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { type DocumentIndexPipelineSettings } from '../../../DocumentIndexes/Application/Assemblers/write-request-document-indexes.assembler.ts'
import { LEXICAL_PROFILE_VERSION } from '../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Adapters/lexical-search-query.adapter.ts'
import { EmbeddingProvider } from '../../../Shared/Application/Ports/Out/Gateways/embedding-provider.ts'

export const DOCUMENT_INDEX_PIPELINE_SETTINGS = Symbol('RAG_INDEX_PIPELINE_SETTINGS')

const createDocumentIndexPipelineSettings = (
  serviceConfig: KnowledgeServiceConfig,
  embeddingProvider: EmbeddingProvider,
): DocumentIndexPipelineSettings => ({
  embeddingModel: embeddingProvider.modelId,
  embeddingDimensions: serviceConfig.embeddingDimensions,
  chunkingModel: serviceConfig.chunkingModel,
  chunkingProfile: CHUNKING_PROFILE_VERSION,
  embeddingProfile: `mean-pooling-normalized:${serviceConfig.embeddingDimensions}`,
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: RELATION_PROFILE_VERSION,
})

export const indexingProfilesProviders = [
  {
    provide: DOCUMENT_INDEX_PIPELINE_SETTINGS,
    useFactory: createDocumentIndexPipelineSettings,
    inject: [KNOWLEDGE_SERVICE_CONFIG, EmbeddingProvider],
  },
]
