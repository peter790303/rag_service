import 'reflect-metadata'
import { NestFactory } from '@nestjs/core'

import { AppModule } from './app.module.js'
import { loadRagConfig } from '../config/rag.config.js'
import { ApplicationErrorFilter } from './Interfaces/Http/ExceptionHandlers/application-error.filter.js'
import { createGlobalValidationPipe } from './Interfaces/Http/Pipes/create-global-validation-pipe.js'

const bootstrap = async (): Promise<void> => {
  const config = loadRagConfig()
  const httpApplication = await NestFactory.create(AppModule)
  httpApplication.useGlobalFilters(new ApplicationErrorFilter())
  httpApplication.useGlobalPipes(createGlobalValidationPipe())
  await httpApplication.listen(config.port)
}

void bootstrap()
