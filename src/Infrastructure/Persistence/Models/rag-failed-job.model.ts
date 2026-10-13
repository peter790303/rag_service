import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentModel } from './rag-document.model.js'
import { RagJobModel } from './rag-job.model.js'
import { RagKnowledgeBaseModel } from './rag-knowledge-base.model.js'

@Entity('failed_jobs')
@Unique('UQ_rag_failed_jobs_job_id', ['jobId'])
export class RagFailedJobModel {
  @ManyToOne(() => RagJobModel, (job) => job.failedJobs, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'job_id', referencedColumnName: 'id' })
  declare job: Relation<RagJobModel>

  @ManyToOne(() => RagKnowledgeBaseModel, (knowledgeBase) => knowledgeBase.failedJobs, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'knowledge_base_id', referencedColumnName: 'id' })
  declare knowledgeBase: Relation<RagKnowledgeBaseModel>

  @ManyToOne(() => RagDocumentModel, (document) => document.failedJobs, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<RagDocumentModel>

  @ManyToOne(() => RagDocumentIndexModel, (documentIndex) => documentIndex.failedJobs, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'document_index_id', referencedColumnName: 'id' })
  declare documentIndex: Relation<RagDocumentIndexModel>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'job_id', type: 'uuid' })
  declare jobId: string

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

  @Column({ name: 'error_code', type: 'text', nullable: true })
  declare errorCode: string | null

  @Column({ name: 'error_message', type: 'text', nullable: true })
  declare errorMessage: string | null

  @Column({ name: 'blocked_reasons', type: 'jsonb', default: () => "'[]'::jsonb" })
  declare blockedReasons: unknown[]

  @Column({ name: 'retry_payload', type: 'jsonb' })
  declare retryPayload: Record<string, unknown>

  @Column({ name: 'failed_at', type: 'timestamptz', default: () => 'now()' })
  declare failedAt: Date

  @Column({ name: 'retried_at', type: 'timestamptz', nullable: true })
  declare retriedAt: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date
}
