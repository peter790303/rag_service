import { MigrationInterface, QueryRunner } from 'typeorm'

export class CreateDocumentRelations1729000000007 implements MigrationInterface {
  name = 'CreateDocumentRelations1729000000007'

  private schema(queryRunner: QueryRunner): string {
    const schema = (queryRunner.connection.options as { schema?: string }).schema ?? 'public'

    return `"${String(schema).replaceAll('"', '""')}"`
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)

    if (schema !== '"public"') await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS ${schema}`)

    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query(`CREATE TABLE document_relations (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        source_index_id uuid NOT NULL REFERENCES document_indexes(id) ON DELETE RESTRICT,
        target_document_id uuid REFERENCES documents(id) ON DELETE RESTRICT,
        target_reference text NOT NULL,
        target_anchor text,
        relation_type text NOT NULL CHECK (relation_type IN ('markdown_link', 'wiki_link', 'references', 'requires', 'applies_to', 'overrides')),
        evidence_block_start integer NOT NULL CHECK (evidence_block_start >= 0),
        evidence_block_end integer NOT NULL CHECK (evidence_block_end > evidence_block_start),
        evidence_text text NOT NULL
      );
CREATE INDEX idx_relations_source ON document_relations(source_index_id);
CREATE INDEX idx_relations_target ON document_relations(target_document_id) WHERE target_document_id IS NOT NULL;`)
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const schema = this.schema(queryRunner)
    await queryRunner.query(`SET search_path TO ${schema}, public`)
    try {
      await queryRunner.query('DROP TABLE document_relations')
    } finally {
      await queryRunner.query('RESET search_path')
    }
  }
}
