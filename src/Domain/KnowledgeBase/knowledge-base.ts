import { InvalidKnowledgeBaseStateException } from './Exceptions/invalid-knowledge-base-state.exception.ts'
import { KnowledgeBaseProjectMismatchException } from './Exceptions/knowledge-base-project-mismatch.exception.ts'
import { KnowledgeBaseRetrieval, type KnowledgeBaseRetrievalState } from './ValueObjects/knowledge-base-retrieval.ts'

export type KnowledgeBaseState = {
  id: string
  projectId: string
  projectName: string
  createdAt: Date
  updatedAt: Date
}

/** Persistent project-owned collection; retrieval evidence belongs to this loaded identity. */
export class KnowledgeBase {
  readonly id: string

  readonly projectId: string

  private currentProjectName: string

  private readonly sourceCreatedAt: Date

  private sourceUpdatedAt: Date

  private currentRetrieval: KnowledgeBaseRetrieval | null = null

  private constructor(state: KnowledgeBaseState) {
    KnowledgeBase.requireText(state.id, 'id')
    KnowledgeBase.requireText(state.projectId, 'projectId')
    KnowledgeBase.requireText(state.projectName, 'projectName')
    KnowledgeBase.requireDate(state.createdAt, 'createdAt')
    KnowledgeBase.requireDate(state.updatedAt, 'updatedAt')

    if (state.updatedAt < state.createdAt) throw new InvalidKnowledgeBaseStateException('updatedAt')

    this.id = state.id
    this.projectId = state.projectId
    this.currentProjectName = state.projectName
    this.sourceCreatedAt = new Date(state.createdAt)
    this.sourceUpdatedAt = new Date(state.updatedAt)
  }

  static create(state: KnowledgeBaseState): KnowledgeBase {
    return new KnowledgeBase(state)
  }

  get projectName(): string {
    return this.currentProjectName
  }

  get createdAt(): Date {
    return new Date(this.sourceCreatedAt)
  }

  get updatedAt(): Date {
    return new Date(this.sourceUpdatedAt)
  }

  get retrieval(): KnowledgeBaseRetrieval | null {
    return this.currentRetrieval
  }

  assertProject(projectId: string): void {
    if (this.projectId !== projectId) throw new KnowledgeBaseProjectMismatchException()
  }

  synchronizeProjectName(projectName: string, updatedAt: Date): void {
    KnowledgeBase.requireText(projectName, 'projectName')
    KnowledgeBase.requireDate(updatedAt, 'updatedAt')

    if (updatedAt < this.sourceCreatedAt) throw new InvalidKnowledgeBaseStateException('updatedAt')

    this.currentProjectName = projectName
    this.sourceUpdatedAt = new Date(updatedAt)
  }

  recordRetrieval(state: KnowledgeBaseRetrievalState): void {
    this.currentRetrieval = new KnowledgeBaseRetrieval(this.id, state)
  }

  private static requireText(value: string, field: string): void {
    if (typeof value !== 'string' || !value.trim()) throw new InvalidKnowledgeBaseStateException(field)
  }

  private static requireDate(value: Date, field: string): void {
    if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
      throw new InvalidKnowledgeBaseStateException(field)
  }
}
