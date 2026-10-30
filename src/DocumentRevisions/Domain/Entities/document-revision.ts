import { InvalidDateTimeException } from '../../../Shared/Domain/Exceptions/invalid-date-time.exception.ts'
import { DateTime } from '../../../Shared/Domain/ValueObjects/date-time.ts'
import { InvalidDocumentRevisionContentException } from '../Exceptions/invalid-document-revision-content.exception.ts'
import { InvalidDocumentRevisionHashException } from '../Exceptions/invalid-document-revision-hash.exception.ts'
import { InvalidDocumentRevisionIdentityException } from '../Exceptions/invalid-document-revision-identity.exception.ts'
import { InvalidDocumentRevisionTimestampException } from '../Exceptions/invalid-document-revision-timestamp.exception.ts'

export type DocumentRevisionState = {
  readonly id: string
  readonly documentId: string
  readonly contentSha256: string
  readonly title: string | null
  readonly content: string
  readonly capturedAt: Date | DateTime
  readonly createdAt: Date | DateTime
}

/** An immutable captured document version, identified independently of its indexes. */
export class DocumentRevision {
  readonly id: string

  readonly documentId: string

  readonly contentSha256: string

  readonly title: string | null

  readonly content: string

  private readonly captureTime: DateTime

  private readonly creationTime: DateTime

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

    this.id = state.id
    this.documentId = state.documentId
    this.contentSha256 = state.contentSha256
    this.title = state.title
    this.content = state.content
    this.captureTime = this.toDateTime(state.capturedAt)
    this.creationTime = this.toDateTime(state.createdAt)
  }

  get capturedAt(): DateTime {
    return this.captureTime
  }

  get createdAt(): DateTime {
    return this.creationTime
  }

  isRetentionExpired(cutoff: Date | DateTime): boolean {
    return this.creationTime.epochMilliseconds <= this.toDateTime(cutoff).epochMilliseconds
  }

  private toDateTime(value: Date | DateTime): DateTime {
    try {
      return new DateTime(value)
    } catch (cause) {
      if (!(cause instanceof InvalidDateTimeException)) throw cause

      throw new InvalidDocumentRevisionTimestampException()
    }
  }
}
