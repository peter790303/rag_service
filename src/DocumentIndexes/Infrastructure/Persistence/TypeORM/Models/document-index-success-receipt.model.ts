import { Column, Entity, PrimaryColumn } from 'typeorm'

@Entity('document_index_success_receipts')
export class DocumentIndexSuccessReceiptModel {
  @PrimaryColumn({ name: 'job_id', type: 'uuid' })
  declare jobId: string

  @Column({ name: 'project_id', type: 'text' })
  declare projectId: string

  @Column({ name: 'knowledge_base_id', type: 'uuid' })
  declare knowledgeBaseId: string

  @Column({ name: 'document_id', type: 'uuid' })
  declare documentId: string

  @Column({ name: 'document_index_id', type: 'uuid' })
  declare documentIndexId: string

  @Column({ type: 'bigint' })
  declare generation: string

  @Column({ type: 'integer' })
  declare attempts: number

  @Column({ name: 'execution_verification', type: 'jsonb', nullable: true })
  declare executionVerification: Record<string, unknown> | null

  @Column({ name: 'completed_at', type: 'timestamptz' })
  declare completedAt: Date
}
