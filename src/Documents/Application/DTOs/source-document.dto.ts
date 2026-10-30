import { DocumentSourceTypeEnum } from '../../Domain/Enums/document-source-type.enum.ts'

export type SourceDocumentDTO = {
  knowledgeBaseId: string
  projectId: string
  projectName: string
  sourceType: DocumentSourceTypeEnum
  sourceKey: string
  sourcePath: string
  title?: string | null
  content: string
  payload?: Record<string, unknown>
  isEntry?: boolean
  alwaysIncludeFullContent?: boolean
}
