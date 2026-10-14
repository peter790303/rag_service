export const RAG_DOCUMENT_INDEX_STATUS = {
  BUILDING: 'building',
  READY: 'ready',
  FAILED: 'failed',
  DELETING: 'deleting',
} as const

export type RagDocumentIndexStatus = (typeof RAG_DOCUMENT_INDEX_STATUS)[keyof typeof RAG_DOCUMENT_INDEX_STATUS]
