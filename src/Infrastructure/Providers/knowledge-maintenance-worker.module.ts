import { Module } from '@nestjs/common'

import { KnowledgeServiceInfrastructureModule } from './knowledge-service-infrastructure.module.ts'
import { KnowledgeMaintenanceWorker } from '../../Interfaces/Console/Workers/knowledge-maintenance-worker.ts'

@Module({ imports: [KnowledgeServiceInfrastructureModule], providers: [KnowledgeMaintenanceWorker] })
export class KnowledgeMaintenanceWorkerModule {}
