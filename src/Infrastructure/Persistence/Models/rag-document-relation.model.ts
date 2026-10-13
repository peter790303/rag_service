import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'
import { RagDocumentModel } from './rag-document.model.js'

@Entity('document_relations')
export class RagDocumentRelationModel {
  @ManyToOne(() => RagDocumentIndexModel, (documentIndex) => documentIndex.relations, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'source_index_id', referencedColumnName: 'id' })
  declare sourceIndex: Relation<RagDocumentIndexModel>

  @ManyToOne(() => RagDocumentModel, (document) => document.incomingRelations, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'target_document_id', referencedColumnName: 'id' })
  declare targetDocument: Relation<RagDocumentModel | null>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'source_index_id', type: 'uuid' })
  declare sourceIndexId: string

  @Column({ name: 'target_document_id', type: 'uuid', nullable: true })
  declare targetDocumentId: string | null

  @Column({ name: 'target_reference', type: 'text' })
  declare targetReference: string

  @Column({ name: 'target_anchor', type: 'text', nullable: true })
  declare targetAnchor: string | null

  @Column({ name: 'relation_type', type: 'text' })
  declare relationType: string

  @Column({ name: 'evidence_block_start', type: 'integer' })
  declare evidenceBlockStart: number

  @Column({ name: 'evidence_block_end', type: 'integer' })
  declare evidenceBlockEnd: number

  @Column({ name: 'evidence_text', type: 'text' })
  declare evidenceText: string
}
