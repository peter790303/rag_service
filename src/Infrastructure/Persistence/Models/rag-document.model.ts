import { Column, CreateDateColumn, Entity, OneToMany, PrimaryGeneratedColumn, Unique, type Relation } from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentRelationModel } from './rag-document-relation.model.js'
import { RagDocumentRevisionModel } from './rag-document-revision.model.js'
import { RagFailedJobModel } from './rag-failed-job.model.js'
import { RagJobModel } from './rag-job.model.js'
import { RagMembershipModel } from './rag-membership.model.js'

@Entity('documents')
@Unique('UQ_documents_source_identity', ['sourceType', 'sourceKey', 'sourcePath'])
export class RagDocumentModel {
  @OneToMany(() => RagMembershipModel, (membership) => membership.document, { createForeignKeyConstraints: false })
  declare memberships: Relation<RagMembershipModel[]>

  @OneToMany(() => RagDocumentRevisionModel, (revision) => revision.document, { createForeignKeyConstraints: false })
  declare revisions: Relation<RagDocumentRevisionModel[]>

  @OneToMany(() => RagDocumentIndexModel, (documentIndex) => documentIndex.document, {
    createForeignKeyConstraints: false,
  })
  declare indexes: Relation<RagDocumentIndexModel[]>

  @OneToMany(() => RagJobModel, (job) => job.document, { createForeignKeyConstraints: false })
  declare jobs: Relation<RagJobModel[]>

  @OneToMany(() => RagFailedJobModel, (failedJob) => failedJob.document, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<RagFailedJobModel[]>

  @OneToMany(() => RagDocumentRelationModel, (relation) => relation.targetDocument, {
    createForeignKeyConstraints: false,
  })
  declare incomingRelations: Relation<RagDocumentRelationModel[]>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'source_type', type: 'text' })
  declare sourceType: string

  @Column({ name: 'source_key', type: 'text' })
  declare sourceKey: string

  @Column({ name: 'source_path', type: 'text' })
  declare sourcePath: string

  @Column({ name: 'current_title', type: 'text', nullable: true })
  declare currentTitle: string | null

  @Column({ name: 'unreferenced_since', type: 'timestamptz', nullable: true })
  declare unreferencedSince: Date | null

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date
}
