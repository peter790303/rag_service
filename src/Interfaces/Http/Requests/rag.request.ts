import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
  MinLength,
} from 'class-validator'

import type {
  HybridRetrieveDto,
  RagSourceDocumentDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import { RagSourceTypeEnum } from '../../../Domain/Knowledge/Enums/rag-source-type.enum.js'

export class RagSourceDocumentRequest implements RagSourceDocumentDto {
  @IsUUID() knowledgeBaseId!: string

  @IsString() @MinLength(1) projectId!: string

  @IsString() projectName!: string

  @IsEnum(RagSourceTypeEnum) sourceType!: RagSourceTypeEnum

  @IsString() sourceKey!: string

  @IsString() sourcePath!: string

  @IsOptional() @IsString() title?: string

  @IsString() content!: string

  @IsOptional() @IsObject() payload?: Record<string, unknown>

  @IsOptional() @IsBoolean() isEntry?: boolean

  @IsOptional() @IsBoolean() alwaysIncludeFullContent?: boolean

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
  @IsString() projectId!: string

  @IsString() @MinLength(1) queryText!: string

  @IsOptional() @IsArray() @IsNumber({ allowNaN: false, allowInfinity: false }, { each: true }) queryVector?: number[]

  @IsOptional() @IsString() embeddingModelId?: string

  @IsOptional() @IsInt() @Min(1) @Max(100) topK?: number

  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number

  @IsOptional() @IsString() documentReference?: string

  @IsOptional() @IsBoolean() includeNonEffective?: boolean

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

  toDTO(): { projectId: string; documentIds: string[] } {
    return { projectId: this.projectId, documentIds: this.documentIds }
  }
}
