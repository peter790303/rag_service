import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  OneToMany,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm'

import { FailedJobModel } from './failed-job.model.ts'
import { JobModel } from './job.model.ts'
import { ChunkModel } from '../../../../../Chunks/Infrastructure/Persistence/TypeORM/Models/chunk.model.ts'
import { DocumentRelationModel } from '../../../../../DocumentRelations/Infrastructure/Persistence/TypeORM/Models/document-relation.model.ts'
import { DocumentRevisionModel } from '../../../../../DocumentRevisions/Infrastructure/Persistence/TypeORM/Models/document-revision.model.ts'
import { DocumentModel } from '../../../../../Documents/Infrastructure/Persistence/TypeORM/Models/document.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../../../KnowledgeBaseDocuments/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'
import type { DocumentIndexStatus } from '../../../../Domain/Enums/document-index-status.enum.ts'

@Entity('document_indexes')
@Unique('UQ_document_indexes_revision_pipeline', ['revisionId', 'pipelineHash'])
@Unique('UQ_document_indexes_document_id', ['documentId', 'id'])
export class DocumentIndexModel {
  @ManyToOne(() => DocumentModel, (document) => document.indexes, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<DocumentModel>

  @ManyToOne(() => DocumentRevisionModel, (revision) => revision.indexes, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'revision_id', referencedColumnName: 'id' })
  declare revision: Relation<DocumentRevisionModel>

  @OneToMany(() => ChunkModel, (chunk) => chunk.documentIndex, { createForeignKeyConstraints: false })
  declare chunks: Relation<ChunkModel[]>

  @OneToMany(() => DocumentRelationModel, (relation) => relation.sourceIndex, { createForeignKeyConstraints: false })
  declare relations: Relation<DocumentRelationModel[]>

  @OneToMany(() => KnowledgeBaseDocumentModel, (knowledgeBaseDocument) => knowledgeBaseDocument.activeDocumentIndex, {
    createForeignKeyConstraints: false,
  })
  declare activeKnowledgeBaseDocuments: Relation<KnowledgeBaseDocumentModel[]>

  @OneToMany(() => JobModel, (job) => job.documentIndex, { createForeignKeyConstraints: false })
  declare jobs: Relation<JobModel[]>

  @OneToMany(() => FailedJobModel, (failedJob) => failedJob.documentIndex, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<FailedJobModel[]>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'document_id', type: 'uuid' })
  declare documentId: string

  @Column({ name: 'revision_id', type: 'uuid' })
  declare revisionId: string

  @Column({ name: 'pipeline_hash', type: 'char', length: 64 })
  declare pipelineHash: string

  @Column({ name: 'chunking_model', type: 'text' })
  declare chunkingModel: string

  @Column({ name: 'chunking_profile', type: 'text' })
  declare chunkingProfile: string

  @Column({ name: 'embedding_model', type: 'text' })
  declare embeddingModel: string

  @Column({ name: 'embedding_dimensions', type: 'integer' })
  declare embeddingDimensions: number

  @Column({ name: 'embedding_profile', type: 'text' })
  declare embeddingProfile: string

  @Column({ name: 'lexical_profile', type: 'text' })
  declare lexicalProfile: string

  @Column({ name: 'relation_profile', type: 'text' })
  declare relationProfile: string

  @Column({ type: 'text' })
  declare status: DocumentIndexStatus

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  declare readyAt: Date | null

  @Column({ name: 'unreferenced_since', type: 'timestamptz', nullable: true })
  declare unreferencedSince: Date | null
}
