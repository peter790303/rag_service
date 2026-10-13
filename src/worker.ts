import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'

import { WorkerModule } from './Infrastructure/Providers/worker.module.js'

const bootstrap = async (): Promise<void> => {
  const workerApplicationContext = await NestFactory.createApplicationContext(WorkerModule)
  const shutdown = async (): Promise<void> => {
    await workerApplicationContext.close()
  }
  process.once('SIGINT', () => void shutdown())
  process.once('SIGTERM', () => void shutdown())
}

void bootstrap()
