import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'

import { AppModule } from './app.module.ts'
import { loadKnowledgeServiceConfig } from '../config/knowledge-service.config.ts'
import { ApplicationErrorFilter } from './Shared/Interfaces/Nest/ExceptionHandlers/application-error.filter.ts'
import { createGlobalValidationPipe } from './Shared/Interfaces/Nest/Pipes/create-global-validation-pipe.ts'

const bootstrap = async (): Promise<void> => {
  const config = loadKnowledgeServiceConfig()
  const httpApplication = await NestFactory.create(AppModule)
  httpApplication.useGlobalFilters(new ApplicationErrorFilter())
  httpApplication.useGlobalPipes(createGlobalValidationPipe())
  await httpApplication.listen(config.port)
}

void bootstrap()
