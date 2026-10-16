import { Module } from '@nestjs/common'

import { KnowledgeServiceInfrastructureModule } from './Infrastructure/Providers/knowledge-service-infrastructure.module.ts'
import { DocumentIndexesController } from './Interfaces/Http/Controllers/document-indexes.controller.ts'
import { HealthController } from './Interfaces/Http/Controllers/health.controller.ts'
import { KnowledgeBaseMembershipsController } from './Interfaces/Http/Controllers/knowledge-base-memberships.controller.ts'
import { KnowledgeBaseRetrievalController } from './Interfaces/Http/Controllers/knowledge-base-retrieval.controller.ts'
import { ProjectServiceAuthGuard } from './Interfaces/Http/Middleware/project-service-auth.guard.ts'

@Module({
  imports: [KnowledgeServiceInfrastructureModule],
  controllers: [
    HealthController,
    DocumentIndexesController,
    KnowledgeBaseRetrievalController,
    KnowledgeBaseMembershipsController,
  ],
  providers: [ProjectServiceAuthGuard],
})
export class AppModule {}
