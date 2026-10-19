import { GarbageIndexChunkAssembler } from '../Assemblers/garbage-index-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import type { CollectIndexChunkGarbageUseCaseContract } from '../Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import type { IndexChunkGarbageDTO } from '../DataTransferObjects/index-chunk-garbage.dto.ts'
import { ChunkGarbageCollectionLockRequiredException } from '../Exceptions/chunk-garbage-collection-lock-required.exception.ts'
import { IndexChunkGarbageCollectionNotEligibleException } from '../Exceptions/index-chunk-garbage-collection-not-eligible.exception.ts'

export class CollectIndexChunkGarbageUseCase implements CollectIndexChunkGarbageUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {}

  async execute(indexChunkGarbageDTO: IndexChunkGarbageDTO): Promise<void> {
    if (!indexChunkGarbageDTO.lockedDocumentIds.includes(indexChunkGarbageDTO.documentId))
      throw new ChunkGarbageCollectionLockRequiredException()

    if (
      indexChunkGarbageDTO.unreferencedSince === null ||
      indexChunkGarbageDTO.unreferencedSince.getTime() > indexChunkGarbageDTO.retentionCutoff.getTime()
    )
      throw new IndexChunkGarbageCollectionNotEligibleException()

    await this.chunkRepository.removeByDocumentIndexId(
      GarbageIndexChunkAssembler.toChunkIndexQueryObject(indexChunkGarbageDTO),
    )
  }
}
