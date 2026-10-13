import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'

import { RagFailedJobModel } from './rag-failed-job.model.js'
import { RagJobModel } from './rag-job.model.js'
import { RagMembershipModel } from './rag-membership.model.js'

@Entity('knowledge_bases')
export class RagKnowledgeBaseModel {
  @OneToMany(() => RagMembershipModel, (membership) => membership.knowledgeBase, { createForeignKeyConstraints: false })
  declare memberships: Relation<RagMembershipModel[]>

  @OneToMany(() => RagJobModel, (job) => job.knowledgeBase, { createForeignKeyConstraints: false })
  declare jobs: Relation<RagJobModel[]>

  @OneToMany(() => RagFailedJobModel, (failedJob) => failedJob.knowledgeBase, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<RagFailedJobModel[]>

  @PrimaryGeneratedColumn('uuid')
  declare id: string

  @Column({ name: 'project_id', type: 'text', unique: true })
  declare projectId: string

  @Column({ name: 'project_name', type: 'text' })
  declare projectName: string

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  declare createdAt: Date

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  declare updatedAt: Date
}
