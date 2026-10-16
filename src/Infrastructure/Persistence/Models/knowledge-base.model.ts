import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  type Relation,
} from 'typeorm'

import { FailedJobModel } from './failed-job.model.ts'
import { JobModel } from './job.model.ts'
import { KnowledgeBaseDocumentMembershipModel } from './knowledge-base-document-membership.model.ts'

@Entity('knowledge_bases')
export class KnowledgeBaseModel {
  @OneToMany(() => KnowledgeBaseDocumentMembershipModel, (membership) => membership.knowledgeBase, {
    createForeignKeyConstraints: false,
  })
  declare memberships: Relation<KnowledgeBaseDocumentMembershipModel[]>

  @OneToMany(() => JobModel, (job) => job.knowledgeBase, { createForeignKeyConstraints: false })
  declare jobs: Relation<JobModel[]>

  @OneToMany(() => FailedJobModel, (failedJob) => failedJob.knowledgeBase, { createForeignKeyConstraints: false })
  declare failedJobs: Relation<FailedJobModel[]>

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
