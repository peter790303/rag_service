import { Global, Module } from '@nestjs/common'

import { loadRagConfig, RAG_CONFIG } from '../../../config/rag.config.js'

@Global()
@Module({ providers: [{ provide: RAG_CONFIG, useFactory: () => loadRagConfig() }], exports: [RAG_CONFIG] })
export class RagConfigModule {}
