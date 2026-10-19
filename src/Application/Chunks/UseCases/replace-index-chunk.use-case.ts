import { randomUUID } from 'node:crypto'

import { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { AuthorizeDocumentIndexChunkReplacementUseCaseContract } from '../../DocumentIndexes/Contracts/authorize-document-index-chunk-replacement.use-case.contract.ts'
import { AuthorizeDocumentIndexChunkReplacementInputDTO } from '../../DocumentIndexes/DataTransferObjects/authorize-document-index-chunk-replacement-input.dto.ts'
import type { ReplacePlannedDocumentRelationsUseCaseContract } from '../../DocumentRelations/Contracts/replace-planned-document-relations.use-case.contract.ts'
import type { PersistenceTransaction } from '../../KnowledgeBases/Contracts/persistence-transaction.ts'
import { ReplacementChunkAssembler } from '../Assemblers/replacement-chunk.assembler.ts'
import type { ChunkRepository } from '../Contracts/chunk.repository.ts'
import type { ReplaceIndexChunkUseCaseContract } from '../Contracts/replace-index-chunk.use-case.contract.ts'
import type { ReplaceIndexChunkInputDTO } from '../DataTransferObjects/replace-index-chunk-input.dto.ts'
import { IncompleteChunkReplacementOutputException } from '../Exceptions/incomplete-chunk-replacement-output.exception.ts'
import { ReplacementChunkGuard } from '../Guards/replacement-chunk.guard.ts'

/** Replaces all persistence rows for one claimed index as a single transaction. */
export class ReplaceIndexChunkUseCase implements ReplaceIndexChunkUseCaseContract {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly authorizeDocumentIndexChunkReplacement: AuthorizeDocumentIndexChunkReplacementUseCaseContract,
    private readonly chunkRepository: ChunkRepository,
    private readonly replacePlannedDocumentRelationsUseCase: ReplacePlannedDocumentRelationsUseCaseContract,
  ) {}

  async execute(replaceIndexChunkInputDTO: ReplaceIndexChunkInputDTO): Promise<void> {
    const { job, markdownChunkPlan, chunkEmbeddings, now } = replaceIndexChunkInputDTO

    ReplacementChunkGuard.assertValidPlan(markdownChunkPlan)
    ReplacementChunkGuard.assertAlignedOutputs(markdownChunkPlan, chunkEmbeddings)

    // Snapshot validated provider output before locks can yield to another task.
    const replacementChunks = markdownChunkPlan.chunks.map((plannedChunk, ordinal) => {
      const embedding = chunkEmbeddings[ordinal]

      if (embedding === undefined) throw new IncompleteChunkReplacementOutputException({ ordinal })

      const replacementChunk: Chunk = new Chunk({
        id: randomUUID(),
        documentIndexId: job.documentIndexId,
        ordinal,
        headingPath: plannedChunk.headingPath,
        content: plannedChunk.content,
        blockStart: plannedChunk.blockStart,
        blockEnd: plannedChunk.blockEnd,
        tokenCount: plannedChunk.tokenCount,
        embedding,
        searchVector: null,
        createdAt: now,
      })

      return replacementChunk
    })
    const insertChunksQO = ReplacementChunkAssembler.toInsertChunksQueryObject(replacementChunks)

    const chunkIndexQO = ReplacementChunkAssembler.toChunkIndexQueryObject(job.documentIndexId)
    const replacePlannedDocumentRelationsInputDTO = ReplacementChunkAssembler.toReplacePlannedDocumentRelationsInputDTO(
      job.documentIndexId,
      markdownChunkPlan,
    )

    await this.persistenceTransaction.run(async () => {
      if (
        !(await this.authorizeDocumentIndexChunkReplacement.execute(
          new AuthorizeDocumentIndexChunkReplacementInputDTO(job),
        ))
      )
        return

      await this.chunkRepository.removeByDocumentIndexId(chunkIndexQO)
      await this.chunkRepository.insertChunks(insertChunksQO)
      await this.replacePlannedDocumentRelationsUseCase.execute(replacePlannedDocumentRelationsInputDTO)
    })
  }
}
