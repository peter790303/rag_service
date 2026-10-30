import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateFailedJobs1729000000009 implements MigrationInterface {
  name = 'CreateFailedJobs1729000000009'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE failed_jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        job_id uuid NOT NULL UNIQUE,
        knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE RESTRICT,
        document_id uuid NOT NULL,
        document_index_id uuid NOT NULL,
        generation bigint NOT NULL CHECK (generation > 0),
        attempts integer NOT NULL CHECK (attempts = 4),
        error_code text,
        error_message text,
        blocked_reasons jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(blocked_reasons) = 'array'),
        retry_payload jsonb NOT NULL CHECK (jsonb_typeof(retry_payload) = 'object'),
        failed_at timestamptz NOT NULL DEFAULT now(),
        retried_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY (document_id, document_index_id) REFERENCES document_indexes(document_id, id) ON DELETE RESTRICT,
        UNIQUE (knowledge_base_id, document_id, document_index_id, id)
      );
CREATE INDEX idx_failed_jobs_lookup ON failed_jobs(knowledge_base_id, document_id, failed_at DESC);
CREATE INDEX idx_failed_jobs_document_index ON failed_jobs(document_index_id);`)
      await queryRunner.query(`ALTER TABLE jobs ADD CONSTRAINT fk_jobs_retry_failed
        FOREIGN KEY (knowledge_base_id, document_id, document_index_id, retry_of_failed_job_id)
        REFERENCES failed_jobs(knowledge_base_id, document_id, document_index_id, id)
        ON DELETE RESTRICT`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('ALTER TABLE jobs DROP CONSTRAINT fk_jobs_retry_failed')
      await queryRunner.query('DROP TABLE failed_jobs')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
