import type { DocumentIndexStatus } from '../../../Domain/DocumentIndex/Enums/document-index-status.enum.ts'

export type DocumentIndexLifecycleFact = {
  status: DocumentIndexStatus
  readyAt: Date | null
  unreferencedSince: Date | null
}
