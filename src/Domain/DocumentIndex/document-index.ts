import { DocumentIndexStatusEnum, type DocumentIndexStatus } from './Enums/document-index-status.enum.ts'
import { DocumentIndexIdentityRequiredException } from './Exceptions/document-index-identity-required.exception.ts'
import { InvalidDocumentIndexStateException } from './Exceptions/invalid-document-index-state.exception.ts'
import { InvalidDocumentIndexTimestampException } from './Exceptions/invalid-document-index-timestamp.exception.ts'
import { UnsupportedDocumentIndexStatusException } from './Exceptions/unsupported-document-index-status.exception.ts'
import { InvalidDateTimeException } from '../Document/Exceptions/invalid-date-time.exception.ts'
import { DateTime } from '../Document/ValueObjects/date-time.ts'

export type DocumentIndexState = {
  id: string
  documentId: string
  revisionId: string
  pipelineHash: string
  chunkingModel: string
  chunkingProfile: string
  embeddingModel: string
  embeddingDimensions: number
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
  status: DocumentIndexStatus
  createdAt: Date | DateTime
  readyAt: Date | DateTime | null
  unreferencedSince: Date | DateTime | null
}

export class DocumentIndex {
  readonly id: string

  readonly documentId: string

  readonly revisionId: string

  readonly pipelineHash: string

  readonly chunkingModel: string

  readonly chunkingProfile: string

  readonly embeddingModel: string

  readonly embeddingDimensions: number

  readonly embeddingProfile: string

  readonly lexicalProfile: string

  readonly relationProfile: string

  readonly status: DocumentIndexStatus

  private readonly createdTime: DateTime

  private readonly readyTime: DateTime | null

  private readonly unreferencedTime: DateTime | null

  constructor(state: DocumentIndexState) {
    if (typeof state.id !== 'string' || state.id.trim().length === 0) throw new DocumentIndexIdentityRequiredException()

    const requiredFields = [
      'documentId',
      'revisionId',
      'pipelineHash',
      'chunkingModel',
      'chunkingProfile',
      'embeddingModel',
      'embeddingProfile',
      'lexicalProfile',
      'relationProfile',
    ] as const
    requiredFields.forEach((field) => {
      if (typeof state[field] !== 'string' || state[field].trim().length === 0)
        throw new InvalidDocumentIndexStateException({ field })
    })

    if (!Number.isSafeInteger(state.embeddingDimensions) || state.embeddingDimensions < 1)
      throw new InvalidDocumentIndexStateException({ field: 'embeddingDimensions' })

    if (!Object.values(DocumentIndexStatusEnum).includes(state.status))
      throw new UnsupportedDocumentIndexStatusException({ status: state.status })

    this.createdTime = toDateTime(state.createdAt, 'createdAt')
    this.readyTime = state.readyAt === null ? null : toDateTime(state.readyAt, 'readyAt')
    this.unreferencedTime =
      state.unreferencedSince === null ? null : toDateTime(state.unreferencedSince, 'unreferencedSince')
    this.id = state.id
    this.documentId = state.documentId
    this.revisionId = state.revisionId
    this.pipelineHash = state.pipelineHash
    this.chunkingModel = state.chunkingModel
    this.chunkingProfile = state.chunkingProfile
    this.embeddingModel = state.embeddingModel
    this.embeddingDimensions = state.embeddingDimensions
    this.embeddingProfile = state.embeddingProfile
    this.lexicalProfile = state.lexicalProfile
    this.relationProfile = state.relationProfile
    this.status = state.status
  }

  get createdAt(): DateTime {
    return this.createdTime
  }

  get readyAt(): DateTime | null {
    return this.readyTime
  }

  get unreferencedSince(): DateTime | null {
    return this.unreferencedTime
  }

  canReplacePlan(): boolean {
    return this.status !== DocumentIndexStatusEnum.READY
  }

  markReady(at: Date | DateTime): DocumentIndex {
    return this.withLifecycle(DocumentIndexStatusEnum.READY, toDateTime(at, 'readyAt'), null)
  }

  markReferenced(): DocumentIndex {
    return this.withLifecycle(this.status, this.readyAt, null)
  }

  markUnreferenced(at: Date | DateTime): DocumentIndex {
    return this.withLifecycle(this.status, this.readyAt, toDateTime(at, 'unreferencedSince'))
  }

  private withLifecycle(
    status: DocumentIndexStatus,
    readyAt: DateTime | null,
    unreferencedSince: DateTime | null,
  ): DocumentIndex {
    return new DocumentIndex({
      id: this.id,
      documentId: this.documentId,
      revisionId: this.revisionId,
      pipelineHash: this.pipelineHash,
      chunkingModel: this.chunkingModel,
      chunkingProfile: this.chunkingProfile,
      embeddingModel: this.embeddingModel,
      embeddingDimensions: this.embeddingDimensions,
      embeddingProfile: this.embeddingProfile,
      lexicalProfile: this.lexicalProfile,
      relationProfile: this.relationProfile,
      createdAt: this.createdAt,
      status,
      readyAt,
      unreferencedSince,
    })
  }
}

const toDateTime = (value: Date | DateTime, field: 'createdAt' | 'readyAt' | 'unreferencedSince'): DateTime => {
  try {
    return new DateTime(value)
  } catch (error) {
    if (!(error instanceof InvalidDateTimeException)) throw error

    throw new InvalidDocumentIndexTimestampException({ field })
  }
}
