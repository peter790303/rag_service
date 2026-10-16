import { InvalidDocumentRevisionContentException } from './Exceptions/invalid-document-revision-content.exception.ts'
import { InvalidDocumentRevisionHashException } from './Exceptions/invalid-document-revision-hash.exception.ts'
import { InvalidDocumentRevisionIdentityException } from './Exceptions/invalid-document-revision-identity.exception.ts'
import { InvalidDocumentRevisionTimestampException } from './Exceptions/invalid-document-revision-timestamp.exception.ts'

export type DocumentRevisionState = {
  readonly id: string
  readonly documentId: string
  readonly contentSha256: string
  readonly title: string | null
  readonly content: string
  readonly capturedAt: Date
  readonly createdAt: Date
}

/** An immutable captured document version, identified independently of its indexes. */
export class DocumentRevision {
  readonly id: string

  readonly documentId: string

  readonly contentSha256: string

  readonly title: string | null

  readonly content: string

  private readonly captureTime: number

  private readonly creationTime: number

  constructor(state: DocumentRevisionState) {
    if (
      typeof state.id !== 'string' ||
      !state.id.trim() ||
      typeof state.documentId !== 'string' ||
      !state.documentId.trim()
    )
      throw new InvalidDocumentRevisionIdentityException()

    if (typeof state.contentSha256 !== 'string' || !/^[a-f\d]{64}$/i.test(state.contentSha256))
      throw new InvalidDocumentRevisionHashException()

    if (typeof state.content !== 'string' || (state.title !== null && typeof state.title !== 'string'))
      throw new InvalidDocumentRevisionContentException()

    if (
      !(state.capturedAt instanceof Date) ||
      !Number.isFinite(state.capturedAt.getTime()) ||
      !(state.createdAt instanceof Date) ||
      !Number.isFinite(state.createdAt.getTime())
    )
      throw new InvalidDocumentRevisionTimestampException()

    this.id = state.id
    this.documentId = state.documentId
    this.contentSha256 = state.contentSha256
    this.title = state.title
    this.content = state.content
    this.captureTime = state.capturedAt.getTime()
    this.creationTime = state.createdAt.getTime()
  }

  get capturedAt(): Date {
    return new Date(this.captureTime)
  }

  get createdAt(): Date {
    return new Date(this.creationTime)
  }

  isRetentionExpired(cutoff: Date): boolean {
    if (!(cutoff instanceof Date) || !Number.isFinite(cutoff.getTime()))
      throw new InvalidDocumentRevisionTimestampException()

    return this.creationTime <= cutoff.getTime()
  }
}
