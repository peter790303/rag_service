import type { InspectMembershipRetentionUseCaseContract } from '../../Memberships/Contracts/inspect-membership-retention.use-case.contract.ts'
import { PruningDocumentIndexAssembler } from '../Assemblers/pruning-document-index.assembler.ts'
import { WriteLifecycleDocumentIndexAssembler } from '../Assemblers/write-lifecycle-document-index.assembler.ts'
import type { DocumentIndexExecutionQueue } from '../Contracts/document-index-execution.queue.ts'
import type { DocumentIndexRepository } from '../Contracts/document-index.repository.ts'
import type { StartDocumentIndexPruningRetentionUseCaseContract } from '../Contracts/start-document-index-pruning-retention.use-case.contract.ts'
import type { StartDocumentIndexPruningRetentionDto } from '../DataTransferObjects/document-index-garbage.dto.ts'

export class StartDocumentIndexPruningRetentionUseCase implements StartDocumentIndexPruningRetentionUseCaseContract {
  constructor(
    private readonly documentIndexRepository: DocumentIndexRepository,
    private readonly documentIndexExecutionQueue: DocumentIndexExecutionQueue,
    private readonly membershipRetention: InspectMembershipRetentionUseCaseContract,
  ) {}

  async execute({ documentIndexIds, now }: StartDocumentIndexPruningRetentionDto): Promise<void> {
    await [...documentIndexIds].sort().reduce(async (previousIndexRetention, documentIndexId) => {
      await previousIndexRetention
      const restoredDocumentIndexDTO = await this.documentIndexRepository.lockByDocumentIndexId(
        PruningDocumentIndexAssembler.toDocumentIndexIdQueryObject(documentIndexId),
      )

      if (restoredDocumentIndexDTO === null) return

      const membershipProtectsIndex = await this.membershipRetention.execute(
        PruningDocumentIndexAssembler.toInspectMembershipRetentionDTO(documentIndexId),
      )
      const jobCount = await this.documentIndexExecutionQueue.countIndexExecutions(
        PruningDocumentIndexAssembler.toDocumentIndexIdQueryObject(documentIndexId),
      )

      if (membershipProtectsIndex || jobCount > 0) return

      await this.documentIndexRepository.updateByDocumentIndexIdWithLifecycleFields(
        WriteLifecycleDocumentIndexAssembler.toSaveDocumentIndexLifecycleQO(
          restoredDocumentIndexDTO.markUnreferenced(now),
        ),
      )
    }, Promise.resolve())
  }
}
