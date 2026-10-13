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

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentModel } from './rag-document.model.js'

@Entity('document_revisions')
@Unique('UQ_document_revisions_hash', ['documentId', 'contentSha256'])
@Unique('UQ_document_revisions_document_id', ['documentId', 'id'])
export class RagDocumentRevisionModel {
  @ManyToOne(() => RagDocumentModel, (document) => document.revisions, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<RagDocumentModel>

  @OneToMany(() => RagDocumentIndexModel, (documentIndex) => documentIndex.revision, {
    createForeignKeyConstraints: false,
  })
  declare indexes: Relation<RagDocumentIndexModel[]>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'document_id', type: 'uuid' })
  declare documentId: string

  @Column({ name: 'content_sha256', type: 'char', length: 64 })
  declare contentSha256: string

  @Column({ type: 'text', nullable: true })
  declare title: string | null

  @Column({ type: 'text' })
  declare content: string

  @Column({ name: 'captured_at', type: 'timestamptz', default: () => 'now()' })
  declare capturedAt: Date

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date
}
