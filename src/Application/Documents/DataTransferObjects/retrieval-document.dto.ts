import type { DocumentSourceTypeEnum } from '../../../Domain/Document/Enums/document-source-type.enum.ts'

export type RetrievalDocumentDTO = {
  id: string
  sourcePath: string
  sourceKey: string
  sourceType: DocumentSourceTypeEnum
}
