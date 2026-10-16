import { DocumentSourceTypeEnum } from './Enums/document-source-type.enum.ts'
import { InvalidDateTimeException } from './Exceptions/invalid-date-time.exception.ts'
import { InvalidDocumentIdentityException } from './Exceptions/invalid-document-identity.exception.ts'
import { InvalidDocumentSourceException } from './Exceptions/invalid-document-source.exception.ts'
import { InvalidDocumentTimestampException } from './Exceptions/invalid-document-timestamp.exception.ts'
import { DateTime } from './ValueObjects/date-time.ts'

export type DocumentState = {
  readonly id: string
  readonly sourceType: string
  readonly sourceKey: string
  readonly sourcePath: string
  readonly currentTitle: string | null
  readonly createdAt: Date | DateTime
  readonly unreferencedSince: Date | DateTime | null
}

/** Owns a document identity and the retention period that starts when its references disappear. */
export class Document {
  readonly id: string

  readonly sourceType: DocumentSourceTypeEnum

  readonly sourceKey: string

  readonly sourcePath: string

  readonly currentTitle: string | null

  private readonly creationTime: DateTime

  private unreferencedTime: DateTime | null

  constructor(state: DocumentState) {
    if (typeof state.id !== 'string' || !state.id.trim()) throw new InvalidDocumentIdentityException()

    if (
      (state.sourceType !== DocumentSourceTypeEnum.REPOSITORY &&
        state.sourceType !== DocumentSourceTypeEnum.OBSIDIAN) ||
      typeof state.sourceKey !== 'string' ||
      !state.sourceKey.trim() ||
      typeof state.sourcePath !== 'string' ||
      !state.sourcePath.trim() ||
      (state.currentTitle !== null && typeof state.currentTitle !== 'string')
    )
      throw new InvalidDocumentSourceException()

    this.id = state.id
    this.sourceType = state.sourceType
    this.sourceKey = state.sourceKey
    this.sourcePath = state.sourcePath
    this.currentTitle = state.currentTitle
    this.creationTime = this.toDateTime(state.createdAt)
    this.unreferencedTime = state.unreferencedSince === null ? null : this.toDateTime(state.unreferencedSince)
  }

  get createdAt(): DateTime {
    return this.creationTime
  }

  get unreferencedSince(): DateTime | null {
    return this.unreferencedTime
  }

  startRetention(at: Date | DateTime): DateTime {
    const retentionStart = this.toDateTime(at)
    this.unreferencedTime ??= retentionStart

    return this.unreferencedTime
  }

  isRetentionExpired(cutoff: Date | DateTime): boolean {
    const retentionCutoff = this.toDateTime(cutoff)

    return (
      this.unreferencedTime !== null && this.unreferencedTime.epochMilliseconds <= retentionCutoff.epochMilliseconds
    )
  }

  private toDateTime(value: Date | DateTime): DateTime {
    try {
      return new DateTime(value)
    } catch (cause) {
      if (!(cause instanceof InvalidDateTimeException)) throw cause

      throw new InvalidDocumentTimestampException()
    }
  }
}
