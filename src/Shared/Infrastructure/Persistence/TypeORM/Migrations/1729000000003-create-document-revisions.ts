import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDocumentRevisions1729000000003 implements MigrationInterface {
  name = 'CreateDocumentRevisions1729000000003'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE document_revisions (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
        content_sha256 char(64) NOT NULL CHECK (content_sha256 ~ '^[0-9a-f]{64}$'),
        title text,
        content text NOT NULL,
        captured_at timestamptz NOT NULL DEFAULT now(),
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (document_id, content_sha256),
        UNIQUE (document_id, id)
      );`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE document_revisions')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
