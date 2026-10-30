import { DocumentSourceTypeEnum } from '../../Domain/Enums/document-source-type.enum.ts'

export type RetrievalFullContentDocumentView = {
  projectId: string
  documentReference: string
  documentTitle: string | null
  source: DocumentSourceTypeEnum
  contentVersion: string
  documentRevisionId: string
  content: string
}
