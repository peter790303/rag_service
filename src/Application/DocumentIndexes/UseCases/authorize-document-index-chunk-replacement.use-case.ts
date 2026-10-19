import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { ReserveDocumentForIndexingUseCaseContract } from '../../Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import type { ReserveKnowledgeBaseDocumentForIndexingUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/reserve-knowledge-base-document-for-indexing.use-case.contract.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import type { AuthorizeDocumentIndexChunkReplacementUseCaseContract } from '../Contracts/authorize-document-index-chunk-replacement.use-case.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { AuthorizeDocumentIndexChunkReplacementInputDTO } from '../DataTransferObjects/authorize-document-index-chunk-replacement-input.dto.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'

/** Reserves the owning resources, fences the committed claim, and locks the index before authorizing replacement. */
export class AuthorizeDocumentIndexChunkReplacementUseCase implements AuthorizeDocumentIndexChunkReplacementUseCaseContract {
  constructor(
    private readonly reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingUseCaseContract,
    private readonly reserveKnowledgeBaseDocumentForIndexingUseCase: ReserveKnowledgeBaseDocumentForIndexingUseCaseContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
  ) {}

  async execute(
    authorizeDocumentIndexChunkReplacementDTO: AuthorizeDocumentIndexChunkReplacementInputDTO,
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
