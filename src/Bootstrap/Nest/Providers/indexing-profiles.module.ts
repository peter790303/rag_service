import { Module } from '@nestjs/common'

import { EmbeddingModule } from './embedding.module.ts'
import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import {
  DOCUMENT_INDEX_PIPELINE_SETTINGS,
  indexingProfilesProviders,
} from '../../../DocumentIndexes/Infrastructure/Nest/Providers/indexing-profiles.providers.ts'

@Module({
  imports: [KnowledgeServiceConfigModule, EmbeddingModule],
  providers: indexingProfilesProviders,
  exports: [DOCUMENT_INDEX_PIPELINE_SETTINGS],
})
export class IndexingProfilesModule {}
