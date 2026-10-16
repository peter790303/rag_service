import { Column, Entity, JoinColumn, ManyToOne, PrimaryGeneratedColumn, type Relation } from 'typeorm'

import { DocumentIndexModel } from './document-index.model.ts'
import { DocumentModel } from './document.model.ts'

@Entity('document_relations')
export class DocumentRelationModel {
  @ManyToOne(() => DocumentIndexModel, (documentIndex) => documentIndex.relations, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'source_index_id', referencedColumnName: 'id' })
  declare sourceIndex: Relation<DocumentIndexModel>

  @ManyToOne(() => DocumentModel, (document) => document.incomingRelations, {
    nullable: true,
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'target_document_id', referencedColumnName: 'id' })
  declare targetDocument: Relation<DocumentModel | null>

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
