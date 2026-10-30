import { Type } from 'class-transformer'
import { IsInt, IsNumber, IsString, IsUUID, Max, MaxLength, Min, ValidateIf } from 'class-validator'

import type { LoadKnowledgeGraphDTO } from '../../../Application/DataTransferObjects/load-knowledge-graph.dto.ts'

const isPresent = (_object: unknown, value: unknown): boolean => value !== undefined

export class KnowledgeGraphRequest {
  @ValidateIf(isPresent) @IsUUID() documentId?: string

  @ValidateIf(isPresent) @IsString() @MaxLength(200) query?: string

  @ValidateIf(isPresent) @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number

  @ValidateIf(isPresent)
  @Type(() => Number)
  @IsNumber({ allowNaN: false, allowInfinity: false })
  @Min(0)
  @Max(1)
  minSimilarity?: number

  toDTO(projectId: string): LoadKnowledgeGraphDTO {
    return {
      projectId,
      ...(this.documentId !== undefined ? { documentId: this.documentId } : {}),
      ...(this.query !== undefined ? { query: this.query } : {}),
      ...(this.limit !== undefined ? { limit: this.limit } : {}),
      ...(this.minSimilarity !== undefined ? { minSimilarity: this.minSimilarity } : {}),
    }
  }
}
