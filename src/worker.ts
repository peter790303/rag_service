import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'

import { KnowledgeMaintenanceWorkerModule } from './Bootstrap/Nest/Providers/knowledge-maintenance-worker.module.ts'

const bootstrap = async (): Promise<void> => {
  const workerApplicationContext = await NestFactory.createApplicationContext(KnowledgeMaintenanceWorkerModule)
  const shutdown = async (): Promise<void> => {
    await workerApplicationContext.close()
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

void bootstrap()
