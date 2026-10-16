import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { CHUNKING_PROFILE_VERSION, RELATION_PROFILE_VERSION } from '../../../config/chunk-planning-profile.config.ts'
import { type KnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../config/knowledge-service.config.ts'
import { type DocumentIndexPipelineSettings } from '../../Application/DocumentIndexes/Assemblers/write-request-document-indexes.assembler.ts'
import { LEXICAL_PROFILE_VERSION } from '../Persistence/Adapters/lexical-search-query.adapter.ts'

export const DOCUMENT_INDEX_PIPELINE_SETTINGS = Symbol('RAG_INDEX_PIPELINE_SETTINGS')

const createDocumentIndexPipelineSettings = (serviceConfig: KnowledgeServiceConfig): DocumentIndexPipelineSettings => ({
  embeddingModel: serviceConfig.embeddingModel,
  embeddingDimensions: serviceConfig.embeddingDimensions,
  chunkingModel: serviceConfig.chunkingModel,
  chunkingProfile: CHUNKING_PROFILE_VERSION,
  embeddingProfile: `mean-pooling-normalized:${serviceConfig.embeddingDimensions}`,
  lexicalProfile: LEXICAL_PROFILE_VERSION,
  relationProfile: RELATION_PROFILE_VERSION,
})

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [
    {
      provide: DOCUMENT_INDEX_PIPELINE_SETTINGS,
      useFactory: createDocumentIndexPipelineSettings,
      inject: [KNOWLEDGE_SERVICE_CONFIG],
    },
  ],
  exports: [DOCUMENT_INDEX_PIPELINE_SETTINGS],
})
export class IndexingProfilesModule {}
