import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateChunks1729000000006 implements MigrationInterface {
  name = 'CreateChunks1729000000006'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE chunks (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_index_id uuid NOT NULL REFERENCES document_indexes(id) ON DELETE RESTRICT,
        ordinal integer NOT NULL CHECK (ordinal >= 0),
        heading_path text[] NOT NULL DEFAULT '{}',
        content text NOT NULL,
        block_start integer NOT NULL CHECK (block_start >= 0),
        block_end integer NOT NULL CHECK (block_end > block_start),
        token_count integer CHECK (token_count IS NULL OR token_count >= 0),
        embedding vector(384) NOT NULL,
        search_vector tsvector NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_index_id, ordinal)
      );
CREATE INDEX idx_chunks_search_vector ON chunks USING gin(search_vector);`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE chunks')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
