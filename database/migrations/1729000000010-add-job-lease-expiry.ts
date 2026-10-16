import { MoreThan, TableColumn, TableIndex } from 'typeorm'
import type { MigrationInterface, QueryRunner } from 'typeorm'

import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../../src/Application/DocumentIndexes/Helpers/document-index-execution-lifecycle.helper.ts'
import { JobModel } from '../../src/Infrastructure/Persistence/Models/job.model.ts'

const BACKFILL_BATCH_SIZE = 250

// Historical rows may lack a usable expiry; preserve null so expired-job recovery can reclaim them.
const legacyLeaseExpiresAt = (executionVerification: Record<string, unknown> | null): Date | null => {
  const storedLeaseExpiresAt = executionVerification?.lease_expires_at

  if (typeof storedLeaseExpiresAt !== 'string') return null

  const leaseExpiresAt = new Date(storedLeaseExpiresAt)

  return Number.isNaN(leaseExpiresAt.getTime()) ? null : leaseExpiresAt
}

export class AddJobLeaseExpiry1729000000010 implements MigrationInterface {
  name = 'AddJobLeaseExpiry1729000000010'

  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'
    const tablePath = queryRunner.connection.driver.buildTableName('jobs', schema)

    await queryRunner.addColumn(
      tablePath,
      new TableColumn({ name: 'lease_expires_at', type: 'timestamptz', isNullable: true }),
    )

    const jobs = queryRunner.manager.getRepository(JobModel)
    const runningCount = await jobs.countBy({ status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING })
    const backfillNextBatch = async (previousBatch: Promise<string | null>): Promise<string | null> => {
      const previousId = await previousBatch
      const records = await jobs.find({
        select: { id: true, executionVerification: true },
        where: {
          status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING,
          ...(previousId === null ? {} : { id: MoreThan(previousId) }),
        },
        order: { id: 'ASC' },
        take: BACKFILL_BATCH_SIZE,
      })

      await records.reduce(async (previousUpdate, record) => {
        await previousUpdate
        await jobs.update(
          { id: record.id, status: DOCUMENT_INDEX_EXECUTION_STATUS.RUNNING },
          { leaseExpiresAt: legacyLeaseExpiresAt(record.executionVerification) },
        )
      }, Promise.resolve())

      return records.at(-1)?.id ?? previousId
    }

    await Array.from({ length: Math.ceil(runningCount / BACKFILL_BATCH_SIZE) }).reduce(
      backfillNextBatch,
      Promise.resolve<string | null>(null),
    )

    await queryRunner.createIndex(
      tablePath,
      new TableIndex({
        name: 'idx_jobs_status_lease_expiry',
        columnNames: ['status', 'lease_expires_at', 'created_at', 'id'],
      }),
    )
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'
    const tablePath = queryRunner.connection.driver.buildTableName('jobs', schema)

    await queryRunner.dropIndex(tablePath, 'idx_jobs_status_lease_expiry')
    await queryRunner.dropColumn(tablePath, 'lease_expires_at')
  }
}
