import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateKnowledgeBaseDocuments1729000000005 implements MigrationInterface {
  name = 'CreateKnowledgeBaseDocuments1729000000005'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE knowledge_base_documents (
        knowledge_base_id uuid NOT NULL REFERENCES knowledge_bases(id) ON DELETE RESTRICT,
        document_id uuid NOT NULL REFERENCES documents(id) ON DELETE RESTRICT,
        active_document_index_id uuid,
        requested_generation bigint NOT NULL DEFAULT 0 CHECK (requested_generation >= 0),
        is_entry boolean NOT NULL DEFAULT false,
        always_include_full_content boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY (knowledge_base_id, document_id),
        FOREIGN KEY (document_id, active_document_index_id) REFERENCES document_indexes(document_id, id) ON DELETE RESTRICT
      );
CREATE INDEX idx_kbd_document ON knowledge_base_documents(document_id, knowledge_base_id);
CREATE INDEX idx_kbd_active_index ON knowledge_base_documents(active_document_index_id) WHERE active_document_index_id IS NOT NULL;`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE knowledge_base_documents')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
