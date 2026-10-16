import { ChunkDocumentIndexRequiredException } from '../../../Domain/Chunk/Exceptions/chunk-document-index-required.exception.ts'
import { GarbageIndexChunkAssembler } from '../Assemblers/garbage-index-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import type { CollectIndexChunkGarbageUseCaseContract } from '../Contracts/collect-index-chunk-garbage.use-case.contract.ts'
import type { IndexChunkGarbageDto } from '../DataTransferObjects/index-chunk-garbage.dto.ts'
import { ChunkGarbageCollectionLockRequiredException } from '../Exceptions/chunk-garbage-collection-lock-required.exception.ts'
import { IndexChunkGarbageCollectionNotEligibleException } from '../Exceptions/index-chunk-garbage-collection-not-eligible.exception.ts'
import { InvalidIndexChunkGarbageInputException } from '../Exceptions/invalid-index-chunk-garbage-input.exception.ts'

export class CollectIndexChunkGarbageUseCase implements CollectIndexChunkGarbageUseCaseContract {
  constructor(private readonly chunkRepository: ChunkRepository) {}

  async execute(indexChunkGarbageDTO: IndexChunkGarbageDto): Promise<void> {
    if (typeof indexChunkGarbageDTO?.documentIndexId !== 'string' || !indexChunkGarbageDTO.documentIndexId.trim())
      throw new ChunkDocumentIndexRequiredException()

    if (typeof indexChunkGarbageDTO.documentId !== 'string' || !indexChunkGarbageDTO.documentId.trim())
      throw new InvalidIndexChunkGarbageInputException('documentId')

    if (!Array.isArray(indexChunkGarbageDTO.lockedDocumentIds))
      throw new InvalidIndexChunkGarbageInputException('lockedDocumentIds')

    if (
      !(indexChunkGarbageDTO.retentionCutoff instanceof Date) ||
      !Number.isFinite(indexChunkGarbageDTO.retentionCutoff.getTime())
    )
      throw new InvalidIndexChunkGarbageInputException('retentionCutoff')

    if (
      indexChunkGarbageDTO.unreferencedSince !== null &&
      (!(indexChunkGarbageDTO.unreferencedSince instanceof Date) ||
        !Number.isFinite(indexChunkGarbageDTO.unreferencedSince.getTime()))
    )
      throw new InvalidIndexChunkGarbageInputException('unreferencedSince')

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
