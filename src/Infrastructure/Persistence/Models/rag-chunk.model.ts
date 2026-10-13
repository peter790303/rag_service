import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  type Relation,
} from 'typeorm'

import { RagDocumentIndexModel } from './rag-document-index.model.js'

@Entity('chunks')
@Unique('UQ_chunks_index_ordinal', ['documentIndexId', 'ordinal'])
export class RagChunkModel {
  @ManyToOne(() => RagDocumentIndexModel, (documentIndex) => documentIndex.chunks, {
    createForeignKeyConstraints: false,
  })
  @JoinColumn({ name: 'document_index_id', referencedColumnName: 'id' })
  declare documentIndex: Relation<RagDocumentIndexModel>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'document_index_id', type: 'uuid' })
  declare documentIndexId: string

  @Column({ type: 'integer' })
  declare ordinal: number

  @Column({ name: 'heading_path', type: 'text', array: true, default: () => "'{}'" })
  declare headingPath: string[]

  @Column({ type: 'text' })
  declare content: string

  @Column({ name: 'block_start', type: 'integer' })
  declare blockStart: number

  @Column({ name: 'block_end', type: 'integer' })
  declare blockEnd: number

  @Column({ name: 'token_count', type: 'integer', nullable: true })
  declare tokenCount: number | null

  @Column({ type: 'vector', length: 384 })
  declare embedding: number[]

  @Column({ name: 'search_vector', type: 'tsvector' })
  declare searchVector: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date
}
