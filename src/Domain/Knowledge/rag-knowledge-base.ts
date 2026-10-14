import { KnowledgeBaseProjectMismatchException } from './Exceptions/knowledge-base-project-mismatch.exception.js'

export type RagKnowledgeBaseState = {
  id: string
  projectId: string
  projectName: string
}

/** Persistent knowledge-base identity and its synchronized project label. */
export class RagKnowledgeBase {
  private constructor(
    readonly id: string,
    readonly projectId: string,
    private currentProjectName: string,
  ) {}

  static create(state: RagKnowledgeBaseState): RagKnowledgeBase {
    return new RagKnowledgeBase(state.id, state.projectId, state.projectName)
  }

  get projectName(): string {
    return this.currentProjectName
  }

  assertProject(projectId: string): void {
    if (this.projectId !== projectId) throw new KnowledgeBaseProjectMismatchException()
  }

  synchronizeProjectName(projectName: string): void {
    this.currentProjectName = projectName
  }
}
