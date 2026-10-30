import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDocuments1729000000002 implements MigrationInterface {
  name = 'CreateDocuments1729000000002'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE documents (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_type text NOT NULL CHECK (source_type IN ('repository', 'obsidian')),
        source_key text NOT NULL CHECK (length(source_key) > 0),
        source_path text NOT NULL CHECK (length(source_path) > 0),
        current_title text,
        unreferenced_since timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (source_type, source_key, source_path),
        UNIQUE (id)
      );`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE documents')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
