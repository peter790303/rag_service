export type DocumentRevisionRecordDTO = {
  id: string
  documentId: string
  contentSha256: string
  title: string | null
  content: string
  capturedAt: Date
  createdAt: Date
}
