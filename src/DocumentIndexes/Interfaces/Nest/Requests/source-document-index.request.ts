import { IsBoolean, IsEnum, IsObject, IsString, IsUUID, MinLength, ValidateIf } from 'class-validator'

import type { SourceDocumentDTO } from '../../../../Documents/Application/DTOs/source-document.dto.ts'
import { DocumentSourceTypeEnum } from '../../../../Documents/Domain/Enums/document-source-type.enum.ts'

const isPresent = (_object: unknown, value: unknown): boolean => value !== undefined

export class SourceDocumentIndexRequest implements SourceDocumentDTO {
  @IsUUID() knowledgeBaseId!: string

  @IsString() @MinLength(1) projectId!: string

  @IsString() projectName!: string

  @IsEnum(DocumentSourceTypeEnum) sourceType!: DocumentSourceTypeEnum

  @IsString() sourceKey!: string

  @IsString() sourcePath!: string

  @ValidateIf(isPresent) @IsString() title?: string

  @IsString() content!: string

  @ValidateIf(isPresent) @IsObject() payload?: Record<string, unknown>

  @ValidateIf(isPresent) @IsBoolean() isEntry?: boolean

  @ValidateIf(isPresent) @IsBoolean() alwaysIncludeFullContent?: boolean

  toDTO(): SourceDocumentDTO {
    const requestDTO: SourceDocumentDTO = {
      knowledgeBaseId: this.knowledgeBaseId,
      projectId: this.projectId,
      projectName: this.projectName,
      sourceType: this.sourceType,
      sourceKey: this.sourceKey,
      sourcePath: this.sourcePath,
      content: this.content,
    }

    if (this.title !== undefined) requestDTO.title = this.title

    if (this.payload !== undefined) requestDTO.payload = this.payload

    if (this.isEntry !== undefined) requestDTO.isEntry = this.isEntry

    if (this.alwaysIncludeFullContent !== undefined) requestDTO.alwaysIncludeFullContent = this.alwaysIncludeFullContent

    return requestDTO
  }
}
