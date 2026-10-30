import { Global, Module } from '@nestjs/common'

import { loadKnowledgeServiceConfig, KNOWLEDGE_SERVICE_CONFIG } from '../../../../config/knowledge-service.config.ts'

@Global()
@Module({
  providers: [
    {
      provide: KNOWLEDGE_SERVICE_CONFIG,
      useFactory: () => loadKnowledgeServiceConfig(),
    },
  ],
  exports: [KNOWLEDGE_SERVICE_CONFIG],
})
export class KnowledgeServiceConfigModule {}
