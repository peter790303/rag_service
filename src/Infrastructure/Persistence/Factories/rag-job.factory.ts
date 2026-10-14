import type { ExpiredRagJob } from '../../../Application/KnowledgeBases/Contracts/rag-job-claim-transaction.js'
import type { RagJobExecutionVerification } from '../../../Application/KnowledgeBases/Contracts/rag-job-management.js'
import { RagExecutionStageEnum } from '../../../Domain/Knowledge/Enums/rag-execution-stage.enum.js'
import { RAG_JOB_STATUS, RagJob } from '../../../Domain/Knowledge/rag-job.js'
import { RagJobModel } from '../Models/rag-job.model.js'

/** Restores a running job's domain state from its persisted row. */
export class RagJobFactory {
  static toExecutionVerification(verification: Record<string, unknown> | null): RagJobExecutionVerification | null {
    if (!verification) return null

    const stage = verification.stage
    const completedUnits = verification.completedUnits
    const rawTotalUnits = verification.totalUnits
    const rawVerifiedAt = verification.verifiedAt

    if (
      !(typeof stage === 'string' && Object.values(RagExecutionStageEnum).includes(stage as RagExecutionStageEnum)) ||
      typeof completedUnits !== 'number' ||
      !(typeof rawTotalUnits === 'number' || rawTotalUnits === null) ||
      !(typeof rawVerifiedAt === 'string' || rawVerifiedAt === null)
    )
      return null

    const totalUnits: number | null = typeof rawTotalUnits === 'number' ? rawTotalUnits : null
    const verifiedAt: string | null = typeof rawVerifiedAt === 'string' ? rawVerifiedAt : null
    const claimToken = verification.claim_token
    const leaseExpiresAt = verification.lease_expires_at

    return {
      stage: stage as RagExecutionStageEnum,
      completedUnits,
      totalUnits,
      verifiedAt,
      ...(typeof claimToken === 'string' ? { claimToken } : {}),
      ...(typeof leaseExpiresAt === 'string' ? { leaseExpiresAt } : {}),
    }
  }

  static toExpiredLeaseFact(
    model: Pick<
      RagJobModel,
      | 'id'
      | 'knowledgeBaseId'
      | 'documentId'
      | 'documentIndexId'
      | 'generation'
      | 'attempts'
      | 'payload'
      | 'executionState'
    >,
    leaseExpiresAt: Date | null,
  ): ExpiredRagJob {
    return {
      id: model.id,
      knowledgeBaseId: model.knowledgeBaseId,
      documentId: model.documentId,
      documentIndexId: model.documentIndexId,
      generation: model.generation,
      attempts: model.attempts,
      payload: model.payload,
      executionState: model.executionState,
      leaseExpiresAt,
    }
  }

  static toRunningDomain(model: Pick<RagJobModel, 'id' | 'status' | 'attempts' | 'executionVerification'>): RagJob {
    if (model.status !== RAG_JOB_STATUS.RUNNING) {
      throw new TypeError(`Expected a running RAG job, received ${model.status}`)
    }

    return new RagJob({
      id: model.id,
      status: model.status,
      attempts: model.attempts,
      leaseExpiresAt: readLeaseExpiry(model.executionVerification),
    })
  }
}

const readLeaseExpiry = (verification: Record<string, unknown> | null): Date | null => {
  const value = verification?.lease_expires_at

  if (typeof value !== 'string') return null

  const parsed = new Date(value)

  return Number.isNaN(parsed.getTime()) ? null : parsed
}
