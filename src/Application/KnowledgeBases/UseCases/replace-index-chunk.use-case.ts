import { InvalidRagJobLeaseException } from '../../../Domain/Knowledge/Exceptions/invalid-rag-job-lease.exception.js'
import { KnowledgeIndexPendingException } from '../../../Domain/Knowledge/Exceptions/knowledge-index-pending.exception.js'
import type { MarkdownPlan } from '../../../Domain/Knowledge/markdown-chunk.factory.js'
import { assembleRagChunkReplacementRows } from '../Assemblers/rag-index-chunk-replacement.assembler.js'
import type {
  RagIndexChunkReplacementStore,
  RagChunkReplacementWrite,
} from '../Contracts/rag-index-chunk-replacement-store.js'
import type { ClaimedRagIndexJob } from '../DataTransferObjects/rag-index-job.dto.js'
import { RagIndexReplacementGuard } from '../Guards/rag-index-replacement.guard.js'

/** Replaces all persistence rows for one claimed index as a single transaction. */
export class ReplaceIndexChunkUseCase {
  constructor(private readonly replacementStore: RagIndexChunkReplacementStore) {}

  async execute(
    job: ClaimedRagIndexJob,
    plan: MarkdownPlan,
    vectors: readonly number[][],
    lexicalSearchTexts: readonly string[],
    now: Date,
  ): Promise<void> {
    RagIndexReplacementGuard.assertValidPlan(plan)
    RagIndexReplacementGuard.assertAlignedOutputs(plan, vectors, lexicalSearchTexts)
    RagIndexReplacementGuard.assertValidDate(now)

    // Prepare every replacement row before opening the transaction, so invalid output
    // cannot leave the previous chunks and relations partially deleted.
    const chunks: RagChunkReplacementWrite[] = assembleRagChunkReplacementRows(
      job.documentIndexId,
      plan,
      vectors,
      lexicalSearchTexts,
    )
    const relations = plan.relations.map((relation) => ({ ...relation }))

    await this.replacementStore.withReplacementTransaction(async (transaction) => {
      const documentExists = await transaction.lockDocument(job.documentId)
      const membership = await transaction.lockMembership(job.knowledgeBaseId, job.documentId)

      if (!documentExists || membership?.requestedGeneration !== Number(job.generation)) {
        throw new InvalidRagJobLeaseException()
      }

      await transaction.lockClaimedJob(job, new Date())
      const index = await transaction.lockDocumentIndex(job.documentIndexId)

      if (!index) throw new KnowledgeIndexPendingException()

      if (!index.canReplacePlan()) return

      await transaction.deleteChunksForIndex(job.documentIndexId)
      await transaction.deleteRelationsForIndex(job.documentIndexId)
      await transaction.saveChunks(chunks)
      await transaction.saveRelations(job.documentIndexId, relations)
    })
  }
}
