import { DocumentIndexGarbageAssembler } from '../Assemblers/document-index-garbage.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexFailureArchive } from '../Contracts/document-index-failure.archive.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../Contracts/inspect-document-index-retention.use-case.contract.ts'
import type { DocumentIndexRetentionDto } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class InspectDocumentIndexRetentionUseCase implements InspectDocumentIndexRetentionUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly documentIndexFailureArchive: DocumentIndexFailureArchive,
  ) {}

  async execute(documentIndexRetentionDTO: DocumentIndexRetentionDto): Promise<boolean> {
    if ('revisionId' in documentIndexRetentionDTO)
      return (
        (
          await this.documentIndexRepository.findByRevisionId(
            DocumentIndexGarbageAssembler.toDocumentIndexRevisionQueryObject(documentIndexRetentionDTO.revisionId),
          )
        ).length > 0
      )

    const indexCount = await this.documentIndexRepository.findByDocumentId(
      DocumentIndexGarbageAssembler.toDocumentIndexDocumentQueryObject(documentIndexRetentionDTO.documentId),
    )
    const jobCount = await this.documentIndexExecutionQueue.countDocumentExecutions(
      DocumentIndexGarbageAssembler.toDocumentIndexDocumentQueryObject(documentIndexRetentionDTO.documentId),
    )
    const failedJobCount = await this.documentIndexFailureArchive.countDocumentFailures(
      DocumentIndexGarbageAssembler.toDocumentIndexDocumentQueryObject(documentIndexRetentionDTO.documentId),
    )

    return indexCount.length > 0 || jobCount > 0 || failedJobCount > 0
  }
}
