import type { DocumentSourceTypeEnum } from '../../../Domain/Document/Enums/document-source-type.enum.ts'

export type RetrievalDocumentDto = {
  id: string
  sourcePath: string
  sourceKey: string
  sourceType: DocumentSourceTypeEnum
}
