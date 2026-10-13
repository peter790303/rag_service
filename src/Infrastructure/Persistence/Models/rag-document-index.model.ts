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

import { RagChunkModel } from './rag-chunk.model.js'
import { RagDocumentRelationModel } from './rag-document-relation.model.js'
import { RagDocumentRevisionModel } from './rag-document-revision.model.js'
import { RagDocumentModel } from './rag-document.model.js'
import { RagFailedJobModel } from './rag-failed-job.model.js'
import { RagJobModel } from './rag-job.model.js'
import { RagMembershipModel } from './rag-membership.model.js'

@Entity('document_indexes')
@Unique('UQ_document_indexes_revision_pipeline', ['revisionId', 'pipelineHash'])
@Unique('UQ_document_indexes_document_id', ['documentId', 'id'])
export class RagDocumentIndexModel {
  @ManyToOne(() => RagDocumentModel, (document) => document.indexes, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<RagDocumentModel>

  @ManyToOne(() => RagDocumentRevisionModel, (revision) => revision.indexes, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'revision_id', referencedColumnName: 'id' })
  declare revision: Relation<RagDocumentRevisionModel>

  @OneToMany(() => RagChunkModel, (chunk) => chunk.documentIndex, { createForeignKeyConstraints: false })
  declare chunks: Relation<RagChunkModel[]>

  @OneToMany(() => RagDocumentRelationModel, (relation) => relation.sourceIndex, { createForeignKeyConstraints: false })
  declare relations: Relation<RagDocumentRelationModel[]>

  @OneToMany(() => RagMembershipModel, (membership) => membership.activeDocumentIndex, {
    createForeignKeyConstraints: false,
  })
  declare activeMemberships: Relation<RagMembershipModel[]>

  @OneToMany(() => RagJobModel, (job) => job.documentIndex, { createForeignKeyConstraints: false })
  declare jobs: Relation<RagJobModel[]>

  @OneToMany(() => RagFailedJobModel, (failedJob) => failedJob.documentIndex, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<RagFailedJobModel[]>

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
  declare status: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date

  @Column({ name: 'ready_at', type: 'timestamptz', nullable: true })
  declare readyAt: Date | null

  @Column({ name: 'unreferenced_since', type: 'timestamptz', nullable: true })
  declare unreferencedSince: Date | null
}
