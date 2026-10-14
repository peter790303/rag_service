import {
  IsArray,
  ArrayMinSize,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator'

import type {
  HybridRetrieveDto,
  RagSourceDocumentDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'

const isPresent = (_object: unknown, value: unknown): boolean => value !== undefined

export class RagSourceDocumentRequest implements RagSourceDocumentDto {
  @IsUUID() knowledgeBaseId!: string

  @IsString() @MinLength(1) projectId!: string

  @IsString() projectName!: string

  @IsEnum(RagSourceTypeEnum) sourceType!: RagSourceTypeEnum

  @IsString() sourceKey!: string

  @IsString() sourcePath!: string

  @ValidateIf(isPresent) @IsString() title?: string

  @IsString() content!: string

  @ValidateIf(isPresent) @IsObject() payload?: Record<string, unknown>

  @ValidateIf(isPresent) @IsBoolean() isEntry?: boolean

  @ValidateIf(isPresent) @IsBoolean() alwaysIncludeFullContent?: boolean

  toDTO(): RagSourceDocumentDto {
    return {
      knowledgeBaseId: this.knowledgeBaseId,
      projectId: this.projectId,
      projectName: this.projectName,
      sourceType: this.sourceType,
      sourceKey: this.sourceKey,
      sourcePath: this.sourcePath,
      content: this.content,
      ...(this.title === undefined ? {} : { title: this.title }),
      ...(this.payload === undefined ? {} : { payload: this.payload }),
      ...(this.isEntry === undefined ? {} : { isEntry: this.isEntry }),
      ...(this.alwaysIncludeFullContent === undefined
        ? {}
        : { alwaysIncludeFullContent: this.alwaysIncludeFullContent }),
    }
  }
}

export class HybridRetrieveRequest implements HybridRetrieveDto {
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

  toDTO(): HybridRetrieveDto {
    return {
      projectId: this.projectId,
      queryText: this.queryText,
      ...(this.queryVector === undefined ? {} : { queryVector: this.queryVector }),
      ...(this.embeddingModelId === undefined ? {} : { embeddingModelId: this.embeddingModelId }),
      ...(this.topK === undefined ? {} : { topK: this.topK }),
      ...(this.limit === undefined ? {} : { limit: this.limit }),
      ...(this.documentReference === undefined ? {} : { documentReference: this.documentReference }),
      ...(this.includeNonEffective === undefined ? {} : { includeNonEffective: this.includeNonEffective }),
    }
  }
}

export class PruneMembershipsRequest {
  @IsString() @MinLength(1) projectId!: string

  @IsArray() @IsString({ each: true }) documentIds!: string[]

  toDTO(knowledgeBaseId: string): { projectId: string; knowledgeBaseId: string; documentIds: string[] } {
    return { projectId: this.projectId, knowledgeBaseId, documentIds: this.documentIds }
  }
}
