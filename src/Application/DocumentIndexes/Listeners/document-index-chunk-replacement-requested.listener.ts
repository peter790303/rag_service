import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { ReserveDocumentForIndexingUseCaseContract } from '../../Documents/Contracts/reserve-document-for-indexing.use-case.contract.ts'
import type { ReserveMembershipForIndexingUseCaseContract } from '../../Memberships/Contracts/reserve-membership-for-indexing.use-case.contract.ts'
import { ReadLeaseDocumentIndexesAssembler } from '../Assemblers/read-lease-document-indexes.assembler.ts'
import type { DocumentIndexChunkReplacementRequestedListenerContract } from '../Contracts/document-index-chunk-replacement-requested.listener.contract.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { DocumentIndexChunkReplacementRequestedEvent } from '../Events/document-index-chunk-replacement-requested.event.ts'
import { IndexDisappearedBeforeCompletionException } from '../Exceptions/index-disappeared-before-completion.exception.ts'
import { InvalidDocumentIndexExecutionLeaseException } from '../Exceptions/invalid-document-index-execution-lease.exception.ts'
import { DocumentIndexExecutionLeaseGuard } from '../Guards/document-index-execution-lease.guard.ts'

/** Fences a replacement against its current claim while holding the lifecycle locks. */
export class DocumentIndexChunkReplacementRequestedListener implements DocumentIndexChunkReplacementRequestedListenerContract {
  constructor(
    private readonly reserveDocumentForIndexingUseCase: ReserveDocumentForIndexingUseCaseContract,
    private readonly reserveMembershipForIndexingUseCase: ReserveMembershipForIndexingUseCaseContract,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexRepository: DocumentIndexRepository,
  ) {}

  async handle(event: DocumentIndexChunkReplacementRequestedEvent): Promise<DocumentIndex | null> {
    const job = event.delivery
    const documentExists = await this.reserveDocumentForIndexingUseCase.execute({ documentId: job.documentId })

    await this.reserveMembershipForIndexingUseCase.execute({
      knowledgeBaseId: job.knowledgeBaseId,
      documentId: job.documentId,
      generation: job.generation,
    })

    if (!documentExists) throw new InvalidDocumentIndexExecutionLeaseException()

    const lockedJob = await this.documentIndexExecutionQueue.lockExecution({ jobId: job.id })
    const jobLease =
      lockedJob === null ? null : ReadLeaseDocumentIndexesAssembler.toDocumentIndexExecutionLease(lockedJob)

    DocumentIndexExecutionLeaseGuard.assertCurrentClaim(job, jobLease, new Date())

    const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId({
      documentIndexId: job.documentIndexId,
    })

    if (restoredDocumentIndexDTO === null) throw new IndexDisappearedBeforeCompletionException()

    return restoredDocumentIndexDTO.canReplacePlan() ? restoredDocumentIndexDTO : null
  }
}
