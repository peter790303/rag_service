import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsInt,
  IsNumber,
  IsString,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'

import type { HybridRetrieveDTO } from '../../../Application/DTOs/hybrid-retrieve.dto.ts'

const isPresent = (_object: unknown, value: unknown): boolean => value !== undefined

export class HybridKnowledgeRetrievalRequest implements HybridRetrieveDTO {
  @IsString() @MinLength(1) projectId!: string

  @IsString() @MinLength(1) queryText!: string

  @ValidateIf(isPresent)
  @IsArray()
  @ArrayMinSize(1)
  @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true })
  queryVector?: number[]

  @ValidateIf(isPresent) @IsString() embeddingModelId?: string

  @ValidateIf(isPresent) @IsInt() @Min(1) @Max(100) topK?: number

  @ValidateIf(isPresent) @IsInt() @Min(1) @Max(100) limit?: number

  @ValidateIf(isPresent) @IsString() documentReference?: string

  @ValidateIf(isPresent) @IsBoolean() includeNonEffective?: boolean

  toDTO(): HybridRetrieveDTO {
    const requestDTO: HybridRetrieveDTO = {
      projectId: this.projectId,
      queryText: this.queryText,
    }

    if (this.queryVector !== undefined) requestDTO.queryVector = [...this.queryVector]

    if (this.embeddingModelId !== undefined) requestDTO.embeddingModelId = this.embeddingModelId

    if (this.topK !== undefined) requestDTO.topK = this.topK

    if (this.limit !== undefined) requestDTO.limit = this.limit

    if (this.documentReference !== undefined) requestDTO.documentReference = this.documentReference

    if (this.includeNonEffective !== undefined) requestDTO.includeNonEffective = this.includeNonEffective

    return requestDTO
  }
}
