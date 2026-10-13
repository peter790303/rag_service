import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateKnowledgeBases1729000000001 implements MigrationInterface {
  name = 'CreateKnowledgeBases1729000000001'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE knowledge_bases (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        project_id text NOT NULL UNIQUE,
        project_name text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE knowledge_bases')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
