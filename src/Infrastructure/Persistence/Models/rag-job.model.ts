import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentModel } from './rag-document.model.js'
import { RagFailedJobModel } from './rag-failed-job.model.js'
import { RagKnowledgeBaseModel } from './rag-knowledge-base.model.js'
import type { RagJobStatus } from '../../../Domain/Knowledge/rag-job.js'

@Entity('jobs')
@Unique('UQ_rag_jobs_idempotency_key', ['idempotencyKey'])
@Unique('UQ_rag_jobs_knowledge_base_document', ['knowledgeBaseId', 'documentId'])
export class RagJobModel {
  @ManyToOne(() => RagKnowledgeBaseModel, (knowledgeBase) => knowledgeBase.jobs, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'knowledge_base_id', referencedColumnName: 'id' })
  declare knowledgeBase: Relation<RagKnowledgeBaseModel>

  @ManyToOne(() => RagDocumentModel, (document) => document.jobs, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<RagDocumentModel>

  @ManyToOne(() => RagDocumentIndexModel, (documentIndex) => documentIndex.jobs, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_index_id', referencedColumnName: 'id' })
  declare documentIndex: Relation<RagDocumentIndexModel>

  @OneToMany(() => RagFailedJobModel, (failedJob) => failedJob.job, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<RagFailedJobModel[]>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'knowledge_base_id', type: 'uuid' })
  declare knowledgeBaseId: string

  @Column({ name: 'document_id', type: 'uuid' })
  declare documentId: string

  @Column({ name: 'document_index_id', type: 'uuid' })
  declare documentIndexId: string

  @Column({ type: 'bigint' })
  declare generation: string

  @Column({ type: 'text' })
  declare status: RagJobStatus

  @Column({ type: 'integer', default: 0 })
  declare attempts: number

  @Column({ name: 'available_at', type: 'timestamptz', default: () => 'now()' })
  declare availableAt: Date

  @Column({ name: 'reserved_at', type: 'timestamptz', nullable: true })
  declare reservedAt: Date | null

  @Column({ name: 'lease_token', type: 'uuid', nullable: true })
  declare leaseToken: string | null

  @Column({ name: 'idempotency_key', type: 'text', nullable: true, unique: true })
  declare idempotencyKey: string | null

  @Column({ name: 'retry_of_failed_job_id', type: 'uuid', nullable: true })
  declare retryOfFailedJobId: string | null

  @Column({ type: 'jsonb' })
  declare payload: Record<string, unknown>

  @Column({ name: 'execution_state', type: 'jsonb', nullable: true })
  declare executionState: Record<string, unknown> | null

  @Column({ name: 'execution_verification', type: 'jsonb', nullable: true })
  declare executionVerification: Record<string, unknown> | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date
}
