import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateJobs1729000000008 implements MigrationInterface {
  name = 'CreateJobs1729000000008'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE jobs (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE RESTRICT,
        document_id uuid NOT NULL,
        document_index_id uuid NOT NULL,
        generation bigint NOT NULL CHECK (generation > 0),
        status text NOT NULL CHECK (status IN ('queued', 'running')),
        attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 4),
        available_at timestamptz NOT NULL DEFAULT now(),
        reserved_at timestamptz,
        lease_token uuid,
        idempotency_key text UNIQUE,
        retry_of_failed_job_id uuid,
        payload jsonb NOT NULL CHECK (jsonb_typeof(payload) = 'object'),
        execution_state jsonb CHECK (execution_state IS NULL OR jsonb_typeof(execution_state) = 'object'),
        execution_verification jsonb CHECK (
          execution_verification IS NULL OR COALESCE(
            jsonb_typeof(execution_verification) = 'object' AND
            jsonb_typeof(execution_verification->'claim_token') = 'string' AND
            jsonb_typeof(execution_verification->'lease_expires_at') = 'string',
            FALSE
          )
        ),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        lease_expires_at timestamptz,
        FOREIGN KEY (knowledge_base_id, document_id) REFERENCES knowledge_base_documents(knowledge_base_id, document_id) ON DELETE RESTRICT,
        FOREIGN KEY (document_id, document_index_id) REFERENCES document_indexes(document_id, id) ON DELETE RESTRICT,
        UNIQUE (knowledge_base_id, document_id),
        CONSTRAINT jobs_lease_state_check CHECK (
          (status = 'queued' AND attempts < 4 AND reserved_at IS NULL AND lease_token IS NULL AND execution_verification IS NULL) OR
          (status = 'running' AND attempts BETWEEN 1 AND 4 AND reserved_at IS NOT NULL AND lease_token IS NOT NULL AND execution_verification IS NOT NULL))
      );
CREATE INDEX idx_jobs_claim ON jobs(available_at, created_at) WHERE status = 'queued';
CREATE INDEX idx_jobs_recovery ON jobs(reserved_at) WHERE status = 'running';
CREATE INDEX idx_jobs_document_index ON jobs(document_index_id);
CREATE INDEX idx_jobs_retry_failed ON jobs(retry_of_failed_job_id) WHERE retry_of_failed_job_id IS NOT NULL;
CREATE INDEX idx_jobs_status_lease_expiry ON jobs(status, lease_expires_at, created_at, id);`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE jobs')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
