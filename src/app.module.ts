import { Module } from '@nestjs/common'

import { RagInfrastructureModule } from './Infrastructure/Providers/rag-infrastructure.module.js'
import { RagController } from './Interfaces/Http/Controllers/rag.controller.js'

@Module({ imports: [RagInfrastructureModule], controllers: [RagController] })
export class AppModule {}
