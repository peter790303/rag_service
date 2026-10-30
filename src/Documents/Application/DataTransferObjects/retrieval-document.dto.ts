import type { DocumentSourceTypeEnum } from '../../Domain/Enums/document-source-type.enum.ts'

export type RetrievalDocumentDTO = {
  id: string
  sourcePath: string
  sourceKey: string
  sourceType: DocumentSourceTypeEnum
}
