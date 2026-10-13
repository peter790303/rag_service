import { Column, Entity, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn, type Relation } from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentModel } from './rag-document.model.js'
import { RagKnowledgeBaseModel } from './rag-knowledge-base.model.js'

@Entity('knowledge_base_documents')
export class RagMembershipModel {
  @PrimaryColumn({ name: 'knowledge_base_id', type: 'uuid' }) declare knowledgeBaseId: string

  @PrimaryColumn({ name: 'document_id', type: 'uuid' }) declare documentId: string

  @ManyToOne(() => RagKnowledgeBaseModel, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'knowledge_base_id', referencedColumnName: 'id' })
  declare knowledgeBase: Relation<RagKnowledgeBaseModel>

  @ManyToOne(() => RagDocumentModel, { createForeignKeyConstraints: false })
  @JoinColumn({ name: 'document_id', referencedColumnName: 'id' })
  declare document: Relation<RagDocumentModel>

  @ManyToOne(() => RagDocumentIndexModel, (documentIndex) => documentIndex.activeMemberships, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'active_document_index_id', referencedColumnName: 'id' })
  declare activeDocumentIndex: Relation<RagDocumentIndexModel | null>

  @Column({ name: 'active_document_index_id', type: 'uuid', nullable: true }) declare activeDocumentIndexId:
    string | null

  @Column({ name: 'requested_generation', type: 'bigint', default: 0 }) declare requestedGeneration: string

  @Column({ name: 'is_entry', type: 'boolean', default: false }) declare isEntry: boolean

  @Column({ name: 'always_include_full_content', type: 'boolean', default: false })
  declare alwaysIncludeFullContent: boolean

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' }) declare updatedAt: Date
}
