import { Module } from '@nestjs/common'

import { KnowledgeServiceInfrastructureModule } from './Bootstrap/Nest/Providers/knowledge-service-infrastructure.module.ts'
import { DocumentIndexesController } from './DocumentIndexes/Interfaces/Nest/Controllers/document-indexes.controller.ts'
import { IndexManifestController } from './DocumentIndexes/Interfaces/Nest/Controllers/index-manifest.controller.ts'
import { KnowledgeBaseDocumentsController } from './KnowledgeBaseDocuments/Interfaces/Nest/Controllers/knowledge-base-documents.controller.ts'
import { KnowledgeBaseRetrievalController } from './KnowledgeBases/Interfaces/Nest/Controllers/knowledge-base-retrieval.controller.ts'
import { KnowledgeGraphController } from './KnowledgeBases/Interfaces/Nest/Controllers/knowledge-graph.controller.ts'
import { HealthController } from './Shared/Interfaces/Nest/Controllers/health.controller.ts'
import { ProjectServiceAuthGuard } from './Shared/Interfaces/Nest/Middleware/project-service-auth.guard.ts'

@Module({
  imports: [KnowledgeServiceInfrastructureModule],
  controllers: [
    KnowledgeGraphController,
    IndexManifestController,
    HealthController,
    DocumentIndexesController,
    KnowledgeBaseRetrievalController,
    KnowledgeBaseDocumentsController,
  ],
  providers: [ProjectServiceAuthGuard],
})
export class AppModule {}
