import { Module } from '@nestjs/common'

import { RagInfrastructureModule } from './Infrastructure/Providers/rag-infrastructure.module.js'
import { RagController } from './Interfaces/Http/Controllers/rag.controller.js'
import { RagServiceAuthGuard } from './Interfaces/Http/Middleware/rag-service-auth.guard.js'

@Module({ imports: [RagInfrastructureModule], controllers: [RagController], providers: [RagServiceAuthGuard] })
export class AppModule {}
