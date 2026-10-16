import type { DocumentIndexRecordDto } from './document-index-record.dto.ts'
import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'

/** A restored domain index and the real persistence metadata needed by application reads. */
export type RestoredDocumentIndexDto = Omit<
  DocumentIndexRecordDto,
  'id' | 'status' | 'readyAt' | 'unreferencedSince'
> & { documentIndex: DocumentIndex }
