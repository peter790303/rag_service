import type { CollectIndexChunkGarbageCommand } from './collect-index-chunk-garbage.command.ts'
import { GarbageIndexChunkAssembler } from '../Assemblers/garbage-index-chunk.assembler.ts'
import type { CollectIndexChunkGarbageCommandHandlerContract } from '../Contracts/collect-index-chunk-garbage.command.handler.contract.ts'
import { ChunkGarbageCollectionLockRequiredException } from '../Exceptions/chunk-garbage-collection-lock-required.exception.ts'
import { IndexChunkGarbageCollectionNotEligibleException } from '../Exceptions/index-chunk-garbage-collection-not-eligible.exception.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

export class CollectIndexChunkGarbageCommandHandler implements CollectIndexChunkGarbageCommandHandlerContract {
  constructor(private readonly chunkRepository: ChunkRepository) {}

  async execute(command: CollectIndexChunkGarbageCommand): Promise<void> {
    if (!command.lockedDocumentIds.includes(command.documentId)) throw new ChunkGarbageCollectionLockRequiredException()

    if (command.unreferencedSince === null || command.unreferencedSince.getTime() > command.retentionCutoff.getTime())
      throw new IndexChunkGarbageCollectionNotEligibleException()

    await this.chunkRepository.removeByDocumentIndexId(GarbageIndexChunkAssembler.toChunkIndexQO(command))
  }
}
