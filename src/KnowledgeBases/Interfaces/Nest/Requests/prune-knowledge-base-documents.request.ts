import { IsArray, IsString, MinLength } from 'class-validator'

import type { PruneKnowledgeBaseDocumentsDTO } from '../../../Application/DataTransferObjects/prune-knowledge-base-documents.dto.ts'

export class PruneKnowledgeBaseDocumentsRequest {
  @IsString() @MinLength(1) projectId!: string

  @IsArray() @IsString({ each: true }) documentIds!: string[]

  toDTO(knowledgeBaseId: string): PruneKnowledgeBaseDocumentsDTO {
    return { projectId: this.projectId, knowledgeBaseId, documentIds: [...this.documentIds] }
  }
}
