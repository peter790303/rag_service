import type { RagConfig } from '../../../../config/rag.config.js'
import { IndexRetentionPolicy } from '../../../Domain/Knowledge/ValueObjects/index-retention-policy.js'
import { RagGarbageCollectionStore } from '../../../Infrastructure/Persistence/Repositories/Contracts/rag-retention-store.js'

export class CollectRagGarbageUseCase {
  constructor(
    private readonly indexes: RagGarbageCollectionStore,
    private readonly config: RagConfig,
  ) {}

  async execute(): Promise<number> {
    const retentionCutoff = new Date(Date.now() - this.config.gcRetentionMs)

    return this.indexes.withGarbageCollectionTransaction(async (transaction) => {
      const deletedFailedJobCount = await transaction.deleteExpiredUnreferencedFailedJobs(retentionCutoff)
      const candidates = await transaction.findGarbageIndexCandidates()
      const expiredCandidates = candidates.filter(
        (candidate) =>
          candidate.unreferencedSince !== null &&
          candidate.unreferencedSince <= retentionCutoff &&
          IndexRetentionPolicy.mayCollect({
            hasMembership: candidate.membershipCount > 0,
            hasJob: candidate.jobCount > 0 || candidate.activeLeaseCount > 0,
            hasFailedJob: candidate.failedJobCount > 0,
          }),
      )

      let deletedCount = 0
      for (const candidate of expiredCandidates) {
        const wasDeleted = await transaction.deleteIfUnreferenced(candidate.documentIndexId, retentionCutoff)

        if (wasDeleted) deletedCount += 1
      }

      return deletedFailedJobCount + deletedCount
    })
  }
}
