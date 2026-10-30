import { Module } from '@nestjs/common'

import { chunkReplacementProviders } from './chunk-replacement.providers.ts'
import { ChunksModule } from './chunks.module.ts'
import { DocumentIndexingModule } from './document-indexing.module.ts'
import { DocumentRelationsModule } from './document-relations.module.ts'
import { PersistenceModule } from './persistence.module.ts'
import { ReplaceIndexChunkCommandHandlerContract } from '../../../Chunks/Application/Contracts/replace-index-chunk.command.handler.contract.ts'

@Module({
  imports: [PersistenceModule, DocumentIndexingModule, ChunksModule, DocumentRelationsModule],
  providers: chunkReplacementProviders,
  exports: [ReplaceIndexChunkCommandHandlerContract],
})
export class ChunkReplacementModule {}
