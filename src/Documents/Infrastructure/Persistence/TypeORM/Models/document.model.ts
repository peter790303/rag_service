import { Column, CreateDateColumn, Entity, Generated, OneToMany, PrimaryColumn, Unique, type Relation } from 'typeorm'

import { DocumentRelationModel } from './document-relation.model.ts'
import { DocumentRevisionModel } from './document-revision.model.ts'
import { DocumentIndexModel } from '../../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/document-index.model.ts'
import { FailedJobModel } from '../../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/failed-job.model.ts'
import { JobModel } from '../../../../../DocumentIndexes/Infrastructure/Persistence/TypeORM/Models/job.model.ts'
import { KnowledgeBaseDocumentModel } from '../../../../../KnowledgeBases/Infrastructure/Persistence/TypeORM/Models/knowledge-base-document.model.ts'

@Entity('documents')
@Unique('UQ_documents_source_identity', ['sourceType', 'sourceKey', 'sourcePath'])
export class DocumentModel {
  @OneToMany(() => KnowledgeBaseDocumentModel, (knowledgeBaseDocument) => knowledgeBaseDocument.document, {
    createForeignKeyConstraints: false,
  })
  declare knowledgeBaseDocuments: Relation<KnowledgeBaseDocumentModel[]>

  @OneToMany(() => DocumentRevisionModel, (revision) => revision.document, { createForeignKeyConstraints: false })
  declare revisions: Relation<DocumentRevisionModel[]>

  @OneToMany(() => DocumentIndexModel, (documentIndex) => documentIndex.document, {
    createForeignKeyConstraints: false,
  })
  declare indexes: Relation<DocumentIndexModel[]>

  @OneToMany(() => JobModel, (job) => job.document, { createForeignKeyConstraints: false })
  declare jobs: Relation<JobModel[]>

  @OneToMany(() => FailedJobModel, (failedJob) => failedJob.document, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<FailedJobModel[]>

  @OneToMany(() => DocumentRelationModel, (relation) => relation.targetDocument, {
    createForeignKeyConstraints: false,
  })
  declare incomingRelations: Relation<DocumentRelationModel[]>

  // A source conflict keeps the persisted identity while inserts use the candidate's ID.
  @PrimaryColumn({ type: 'uuid', update: false })
  @Generated('uuid')
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

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', update: false })
  declare createdAt: Date
}
