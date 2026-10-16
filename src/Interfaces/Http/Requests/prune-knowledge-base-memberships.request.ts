import { IsArray, IsString, MinLength } from 'class-validator'

export class PruneKnowledgeBaseMembershipsRequest {
  @IsString() @MinLength(1) projectId!: string

  @IsArray() @IsString({ each: true }) documentIds!: string[]

  toDTO(knowledgeBaseId: string): { projectId: string; knowledgeBaseId: string; documentIds: string[] } {
    return { projectId: this.projectId, knowledgeBaseId, documentIds: [...this.documentIds] }
  }
}
