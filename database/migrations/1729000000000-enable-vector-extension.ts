import { MigrationInterface, QueryRunner } from 'typeorm'

export class EnableVectorExtension1729000000000 implements MigrationInterface {
  name = 'EnableVectorExtension1729000000000'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA public')
  }

  public async down(): Promise<void> {
    // The extension can be shared by other schemas, so it is intentionally retained.
  }
}
