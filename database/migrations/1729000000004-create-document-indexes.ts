import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDocumentIndexes1729000000004 implements MigrationInterface {
  name = 'CreateDocumentIndexes1729000000004'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE document_indexes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL,
        revision_id uuid NOT NULL,
        pipeline_hash char(64) NOT NULL CHECK (pipeline_hash ~ '^[0-9a-f]{64}$'),
        chunking_model text NOT NULL,
        chunking_profile text NOT NULL,
        embedding_model text NOT NULL,
        embedding_dimensions integer NOT NULL CHECK (embedding_dimensions = 384),
        embedding_profile text NOT NULL,
        lexical_profile text NOT NULL,
        relation_profile text NOT NULL,
        status text NOT NULL CHECK (status IN ('building', 'ready', 'failed', 'deleting')),
        created_at timestamptz NOT NULL DEFAULT now(),
        ready_at timestamptz,
        unreferenced_since timestamptz,
        FOREIGN KEY (document_id, revision_id) REFERENCES document_revisions(document_id, id) ON DELETE RESTRICT,
        UNIQUE (revision_id, pipeline_hash),
        UNIQUE (document_id, id),
        CHECK ((status IN ('ready', 'deleting')) = (ready_at IS NOT NULL))
      );`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE document_indexes')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
