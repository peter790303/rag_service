import type { PrepareChunkReplacementUseCaseContract } from '../../DocumentIndexes/Contracts/prepare-chunk-replacement.use-case.contract.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../../DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { ReplacementChunkAssembler } from '../Assemblers/replacement-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import type { ReplaceIndexChunkUseCaseContract } from '../Contracts/replace-index-chunk.use-case.contract.ts'
import type { ReplaceIndexChunkInputDto } from '../DataTransferObjects/replace-index-chunk-input.dto.ts'
import { ReplacementChunkGuard } from '../Guards/replacement-chunk.guard.ts'

/** Replaces all persistence rows for one claimed index as a single transaction. */
export class ReplaceIndexChunkUseCase implements ReplaceIndexChunkUseCaseContract {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly prepareChunkReplacementUseCase: PrepareChunkReplacementUseCaseContract,
    private readonly chunkRepository: ChunkRepository,
    private readonly replacePlannedDocumentRelationsUseCase: ReplacePlannedDocumentRelationsUseCaseContract,
  ) {}

  async execute(replaceIndexChunkInputDTO: ReplaceIndexChunkInputDto): Promise<void> {
    const { indexJob, markdownChunkPlan, chunkEmbeddings, lexicalSearchTexts, now } = replaceIndexChunkInputDTO

    ReplacementChunkGuard.assertValidPlan(markdownChunkPlan)
    ReplacementChunkGuard.assertAlignedOutputs(markdownChunkPlan, chunkEmbeddings, lexicalSearchTexts)
    ReplacementChunkGuard.assertValidDate(now)

    // Snapshot validated provider output before locks can yield to another task.
    const saveChunksQO = ReplacementChunkAssembler.toSaveChunksQueryObject(
      indexJob.documentIndexId,
      markdownChunkPlan,
      chunkEmbeddings,
      lexicalSearchTexts,
      now,
    )

    const chunkIndexQO = ReplacementChunkAssembler.toChunkIndexQueryObject(indexJob.documentIndexId)
    const replacePlannedDocumentRelationsInputDTO = ReplacementChunkAssembler.toReplacePlannedDocumentRelationsInputDTO(
      indexJob.documentIndexId,
      markdownChunkPlan,
    )

    await this.persistenceTransaction.run(async () => {
      if (!(await this.prepareChunkReplacementUseCase.execute(indexJob))) return

      await this.chunkRepository.removeByDocumentIndexId(chunkIndexQO)
      await this.chunkRepository.saveChunks(saveChunksQO)
      await this.replacePlannedDocumentRelationsUseCase.execute(replacePlannedDocumentRelationsInputDTO)
    })
  }
}
