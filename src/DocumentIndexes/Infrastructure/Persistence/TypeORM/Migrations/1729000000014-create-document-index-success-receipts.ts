import { Table, TableCheck, TableColumn } from 'typeorm'
import type { MigrationInterface, QueryRunner } from 'typeorm'

const RECEIPTS_TABLE = 'document_index_success_receipts'

const schemaFor = (queryRunner: QueryRunner): string =>
  (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

const tablePathFor = (queryRunner: QueryRunner): string => {
  const schema = schemaFor(queryRunner)

  return queryRunner.connection.driver.buildTableName(RECEIPTS_TABLE, schema)
}

export class CreateDocumentIndexSuccessReceipts1729000000014 implements MigrationInterface {
  name = 'CreateDocumentIndexSuccessReceipts1729000000014'

  async up(queryRunner: QueryRunner): Promise<void> {
    const tablePath = tablePathFor(queryRunner)

    if (await queryRunner.hasTable(tablePath)) return

    await queryRunner.createTable(
      new Table({
        name: RECEIPTS_TABLE,
        schema: schemaFor(queryRunner),
        columns: [
          new TableColumn({ name: 'job_id', type: 'uuid', isPrimary: true }),
          new TableColumn({ name: 'project_id', type: 'text', isNullable: false }),
          new TableColumn({ name: 'knowledge_base_id', type: 'uuid', isNullable: false }),
          new TableColumn({ name: 'document_id', type: 'uuid', isNullable: false }),
          new TableColumn({ name: 'document_index_id', type: 'uuid', isNullable: false }),
          new TableColumn({ name: 'generation', type: 'bigint', isNullable: false }),
          new TableColumn({ name: 'attempts', type: 'integer', isNullable: false }),
          new TableColumn({ name: 'execution_verification', type: 'jsonb', isNullable: true }),
          new TableColumn({ name: 'completed_at', type: 'timestamptz', isNullable: false }),
        ],
        checks: [
          new TableCheck({ name: 'document_index_success_receipts_generation_check', expression: 'generation > 0' }),
          new TableCheck({
            name: 'document_index_success_receipts_attempts_check',
            expression: 'attempts BETWEEN 0 AND 4',
          }),
        ],
      }),
    )
  }

  async down(): Promise<void> {
    // Forward-only: dropping the table would silently discard successful-job receipts.
  }
}
