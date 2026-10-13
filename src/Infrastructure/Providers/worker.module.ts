import { Module } from '@nestjs/common'

import { RagInfrastructureModule } from './rag-infrastructure.module.js'
import { RagWorker } from '../../Interfaces/Console/Workers/rag-worker.js'

@Module({ imports: [RagInfrastructureModule], providers: [RagWorker] })
export class WorkerModule {}
