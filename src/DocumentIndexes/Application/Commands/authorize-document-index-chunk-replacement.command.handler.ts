import type { AuthorizeDocumentIndexChunkReplacementCommand } from './authorize-document-index-chunk-replacement.command.ts'
import type { ReserveDocumentForIndexingCommandHandlerContract } from '../../../Documents/Application/Contracts/reserve-document-for-indexing.command.handler.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract } from '../../../KnowledgeBases/Application/Contracts/reserve-knowledge-base-document-for-indexing.command.handler.contract.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import type { AuthorizeDocumentIndexChunkReplacementCommandHandlerContract } from '../Contracts/authorize-document-index-chunk-replacement.command.handler.contract.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'
import type { DocumentIndexExecutionQueue } from '../Ports/Out/Gateways/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Ports/Out/Repositories/document-index.repository.ts'

/** Reserves the owning resources, fences the committed claim, and locks the index before authorizing replacement. */
export class AuthorizeDocumentIndexChunkReplacementCommandHandler implements AuthorizeDocumentIndexChunkReplacementCommandHandlerContract {
  constructor(
    private readonly reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingCommandHandlerContract,
    private readonly reserveKnowledgeBaseDocumentForIndexingUseCase: ReserveKnowledgeBaseDocumentForIndexingCommandHandlerContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
  ) {}

  async execute(
    authorizeDocumentIndexChunkReplacementDTO: AuthorizeDocumentIndexChunkReplacementCommand,
  ): Promise<DocumentIndex | null> {
    const delivery = authorizeDocumentIndexChunkReplacementDTO.delivery
    const job = { ...delivery, leaseExpiresAt: new Date(delivery.leaseExpiresAt) }
    const document = await this.reserveDocumentForIndexingUseCase.execute({ documentId: job.documentId })

    await this.reserveKnowledgeBaseDocumentForIndexingUseCase.execute({
      knowledgeBaseId: job.knowledgeBaseId,
      documentId: job.documentId,
      generation: job.generation,
    })

    if (document === null) throw new InvalidDocumentIndexExecutionLeaseException()

    const lockedJob = await this.documentIndexExecutionQueue.lockExecution({ jobId: job.id })
    const jobLease =
      lockedJob === null ? null : ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(lockedJob)

    DocumentIndexExecutionLeaseGuard.assertCurrentClaim(job, jobLease, new Date())

    const documentIndex = await this.documentIndexRepository.lockByDocumentIndexId({
      documentIndexId: job.documentIndexId,
    })

    if (documentIndex === null) throw new IndexDisappearedBeforeCompletionException()

    return documentIndex.canReplacePlan() ? documentIndex : null
  }
}
