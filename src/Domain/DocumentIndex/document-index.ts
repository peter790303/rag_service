import { DocumentIndexStatusEnum, type DocumentIndexStatus } from './Enums/document-index-status.enum.ts'
import { DocumentIndexIdentityRequiredException } from './Exceptions/document-index-identity-required.exception.ts'
import { InvalidDocumentIndexStateException } from './Exceptions/invalid-document-index-state.exception.ts'
import { InvalidDocumentIndexTimestampException } from './Exceptions/invalid-document-index-timestamp.exception.ts'
import { UnsupportedDocumentIndexStatusException } from './Exceptions/unsupported-document-index-status.exception.ts'

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
  createdAt: Date
  readyAt: Date | null
  unreferencedSince: Date | null
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

  private readonly createdTime: Date

  private readonly readyTime: Date | null

  private readonly unreferencedTime: Date | null

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

    assertValidDate(state.createdAt, 'createdAt')
    assertValidDateOrNull(state.readyAt, 'readyAt')
    assertValidDateOrNull(state.unreferencedSince, 'unreferencedSince')
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
    this.createdTime = new Date(state.createdAt)
    this.readyTime = cloneDate(state.readyAt)
    this.unreferencedTime = cloneDate(state.unreferencedSince)
  }

  get createdAt(): Date {
    return new Date(this.createdTime)
  }

  get readyAt(): Date | null {
    return cloneDate(this.readyTime)
  }

  get unreferencedSince(): Date | null {
    return cloneDate(this.unreferencedTime)
  }

  canReplacePlan(): boolean {
    return this.status !== DocumentIndexStatusEnum.READY
  }

  markReady(at: Date): DocumentIndex {
    assertValidDate(at, 'readyAt')

    return this.withLifecycle(DocumentIndexStatusEnum.READY, at, null)
  }

  markReferenced(): DocumentIndex {
    return this.withLifecycle(this.status, this.readyAt, null)
  }

  markUnreferenced(at: Date): DocumentIndex {
    assertValidDate(at, 'unreferencedSince')

    return this.withLifecycle(this.status, this.readyAt, at)
  }

  private withLifecycle(
    status: DocumentIndexStatus,
    readyAt: Date | null,
    unreferencedSince: Date | null,
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

const cloneDate = (value: Date | null): Date | null => (value === null ? null : new Date(value))
const assertValidDate = (value: Date, field: 'createdAt' | 'readyAt' | 'unreferencedSince'): void => {
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()))
    throw new InvalidDocumentIndexTimestampException({ field })
}
const assertValidDateOrNull = (value: Date | null, field: 'readyAt' | 'unreferencedSince'): void => {
  if (value !== null) assertValidDate(value, field)
}
