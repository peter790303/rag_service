import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn, type Relation } from 'typeorm'

import { DocumentIndexModel } from './document-index.model.ts'
import { DocumentModel } from './document.model.ts'
import { KnowledgeBaseModel } from './knowledge-base.model.ts'

@Entity('knowledge_base_documents')
export class KnowledgeBaseDocumentMembershipModel {
  @PrimaryColumn({ name: 'knowledge_base_id', type: 'uuid' }) declare knowledgeBaseId: string

  @PrimaryColumn({ name: 'document_id', type: 'uuid' }) declare documentId: string

  @ManyToOne(() => KnowledgeBaseModel, (knowledgeBase) => knowledgeBase.memberships, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'knowledge_base_id', referencedColumnName: 'id' })
  declare knowledgeBase: Relation<KnowledgeBaseModel>

  @ManyToOne(() => DocumentModel, (document) => document.memberships, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<DocumentModel>

  @ManyToOne(() => DocumentIndexModel, (documentIndex) => documentIndex.activeMemberships, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'active_document_index_id', referencedColumnName: 'id' })
  declare activeDocumentIndex: Relation<DocumentIndexModel | null>

  @Column({ name: 'active_document_index_id', type: 'uuid', nullable: true }) declare activeDocumentIndexId:
    string | null

  @Column({ name: 'requested_generation', type: 'bigint', default: 0 }) declare requestedGeneration: string

  @Column({ name: 'is_entry', type: 'boolean', default: false }) declare isEntry: boolean

  @Column({ name: 'always_include_full_content', type: 'boolean', default: false })
  declare alwaysIncludeFullContent: boolean

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) declare updatedAt: Date
}
