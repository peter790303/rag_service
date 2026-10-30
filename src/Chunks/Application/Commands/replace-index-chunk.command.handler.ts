import { randomUUID } from 'node:crypto'

import type { ReplaceIndexChunkCommand } from './replace-index-chunk.command.ts'
import type { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../../../DocumentIndexes/Application/Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { AuthorizeDocumentIndexChunkReplacementInputDTO } from '../../../DocumentIndexes/Application/DataTransferObjects/authorize-document-index-chunk-replacement-input.dto.ts'
import type { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import { Chunk } from '../../Domain/Entities/chunk.ts'
import { ReplacementChunkAssembler } from '../Assemblers/replacement-chunk.assembler.ts'
import type { ReplaceIndexChunkCommandHandlerContract } from '../Contracts/replace-index-chunk.command.handler.contract.ts'
import { IncompleteChunkReplacementOutputException } from '../Exceptions/incomplete-chunk-replacement-output.exception.ts'
import { ReplacementChunkGuard } from '../Guards/replacement-chunk.guard.ts'
import type { ChunkRepository } from '../Ports/Out/Repositories/chunk.repository.ts'

/** Replaces all persistence rows for one claimed index as a single transaction. */
export class ReplaceIndexChunkCommandHandler implements ReplaceIndexChunkCommandHandlerContract {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly authorizeDocumentIndexChunkReplacement: AuthorizeDocumentIndexChunkReplacementCommandHandlerContract,
    private readonly chunkRepository: ChunkRepository,
    private readonly replacePlannedDocumentRelationsUseCase: ReplacePlannedDocumentRelationsCommandHandlerContract,
  ) {}

  async execute(replaceIndexChunkCommand: ReplaceIndexChunkCommand): Promise<void> {
    const { job, markdownChunkPlan, chunkEmbeddings, now } = replaceIndexChunkCommand

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
    const insertChunksQO = ReplacementChunkAssembler.toInsertChunksQO(replacementChunks)

    const chunkIndexQO = ReplacementChunkAssembler.toChunkIndexQO(job.documentIndexId)
    const replacePlannedDocumentRelationsCommand = ReplacementChunkAssembler.toReplacePlannedDocumentRelationsCommand(
      job.documentIndexId,
      markdownChunkPlan,
    )

    await this.persistenceTransaction.run(async () => {
      if (
        !(await this.authorizeDocumentIndexChunkReplacement.execute(
          ReplacementChunkAssembler.toAuthorizeDocumentIndexChunkReplacementCommand(
            new AuthorizeDocumentIndexChunkReplacementInputDTO(job),
          ),
        ))
      )
        return

      await this.chunkRepository.removeByDocumentIndexId(chunkIndexQO)
      await this.chunkRepository.insertChunks(insertChunksQO)
      await this.replacePlannedDocumentRelationsUseCase.execute(replacePlannedDocumentRelationsCommand)
    })
  }
}
