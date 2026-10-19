import { InvalidKnowledgeBaseDocumentIndexGenerationException } from './Exceptions/invalid-knowledge-base-document-index-generation.exception.ts'
import { InvalidKnowledgeBaseDocumentStateException } from './Exceptions/invalid-knowledge-base-document-state.exception.ts'
import { KnowledgeBaseDocumentReservationEvidenceUnavailableException } from './Exceptions/knowledge-base-document-reservation-evidence-unavailable.exception.ts'
import { InvalidDateTimeException } from '../Document/Exceptions/invalid-date-time.exception.ts'
import { DateTime } from '../Document/ValueObjects/date-time.ts'

export interface KnowledgeBaseDocumentState {
  readonly knowledgeBaseId: string
  readonly documentId: string
  readonly requestedGeneration: string
  readonly activeDocumentIndexId: string | null
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly updatedAt: Date | DateTime
}

export class KnowledgeBaseDocument {
  readonly knowledgeBaseId: string

  readonly documentId: string

  readonly requestedGeneration: string

  readonly activeDocumentIndexId: string | null

  readonly isEntry: boolean

  readonly alwaysIncludeFullContent: boolean

  private readonly updatedAtValue: DateTime

  private reservationLockAcquired: boolean | undefined

  constructor(knowledgeBaseDocumentState: KnowledgeBaseDocumentState) {
    if (
      typeof knowledgeBaseDocumentState.knowledgeBaseId !== 'string' ||
      !knowledgeBaseDocumentState.knowledgeBaseId.trim()
    )
      throw new InvalidKnowledgeBaseDocumentStateException('knowledgeBaseId')

    if (typeof knowledgeBaseDocumentState.documentId !== 'string' || !knowledgeBaseDocumentState.documentId.trim())
      throw new InvalidKnowledgeBaseDocumentStateException('documentId')

    if (
      typeof knowledgeBaseDocumentState.requestedGeneration !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(knowledgeBaseDocumentState.requestedGeneration)
    )
      throw new InvalidKnowledgeBaseDocumentStateException('requestedGeneration')

    if (
      knowledgeBaseDocumentState.activeDocumentIndexId !== null &&
      (typeof knowledgeBaseDocumentState.activeDocumentIndexId !== 'string' ||
        !knowledgeBaseDocumentState.activeDocumentIndexId.trim())
    )
      throw new InvalidKnowledgeBaseDocumentStateException('activeDocumentIndexId')

    if (typeof knowledgeBaseDocumentState.isEntry !== 'boolean')
      throw new InvalidKnowledgeBaseDocumentStateException('isEntry')

    if (typeof knowledgeBaseDocumentState.alwaysIncludeFullContent !== 'boolean')
      throw new InvalidKnowledgeBaseDocumentStateException('alwaysIncludeFullContent')

    this.updatedAtValue = this.toDateTime(knowledgeBaseDocumentState.updatedAt)

    this.knowledgeBaseId = knowledgeBaseDocumentState.knowledgeBaseId
    this.documentId = knowledgeBaseDocumentState.documentId
    this.requestedGeneration = knowledgeBaseDocumentState.requestedGeneration
    this.activeDocumentIndexId = knowledgeBaseDocumentState.activeDocumentIndexId
    this.isEntry = knowledgeBaseDocumentState.isEntry
    this.alwaysIncludeFullContent = knowledgeBaseDocumentState.alwaysIncludeFullContent
  }

  get updatedAt(): DateTime {
    return this.updatedAtValue
  }

  /** Evidence belongs only to this reservation attempt; it does not promise future row existence. */
  get indexingReservationLockAcquired(): boolean {
    if (this.reservationLockAcquired === undefined)
      throw new KnowledgeBaseDocumentReservationEvidenceUnavailableException()

    return this.reservationLockAcquired
  }

  recordIndexingReservationLock(acquired: boolean): void {
    this.reservationLockAcquired = acquired
  }

  configure(
    options: { isEntry?: boolean; alwaysIncludeFullContent?: boolean },
    updatedAt: Date | DateTime,
  ): KnowledgeBaseDocument {
    return this.withState({
      isEntry: options.isEntry === undefined ? this.isEntry : options.isEntry,
      alwaysIncludeFullContent:
        options.alwaysIncludeFullContent === undefined
          ? this.alwaysIncludeFullContent
          : options.alwaysIncludeFullContent,
      updatedAt,
    })
  }

  requestIndex(
    indexRequest: { generation: string; activeDocumentIndexId: string | null },
    updatedAt: Date | DateTime = this.updatedAt,
  ): KnowledgeBaseDocument {
    if (typeof indexRequest.generation !== 'string' || !/^(0|[1-9]\d*)$/.test(indexRequest.generation))
      throw new InvalidKnowledgeBaseDocumentStateException('requestedGeneration')

    const currentGeneration = BigInt(this.requestedGeneration)
    const requestedGeneration = BigInt(indexRequest.generation)

    if (requestedGeneration < currentGeneration || requestedGeneration > currentGeneration + 1n)
      throw new InvalidKnowledgeBaseDocumentIndexGenerationException({
        currentGeneration: this.requestedGeneration,
        requestedGeneration: indexRequest.generation,
      })

    return this.withState({
      requestedGeneration: indexRequest.generation,
      activeDocumentIndexId: indexRequest.activeDocumentIndexId,
      updatedAt,
    })
  }

  activateIndex(documentIndexId: string, updatedAt: Date | DateTime): KnowledgeBaseDocument {
    return this.withState({ activeDocumentIndexId: documentIndexId, updatedAt })
  }

  detachIndex(updatedAt: Date | DateTime): KnowledgeBaseDocument {
    return this.withState({ activeDocumentIndexId: null, updatedAt })
  }

  private withState(changes: Partial<KnowledgeBaseDocumentState>): KnowledgeBaseDocument {
    return new KnowledgeBaseDocument({
      knowledgeBaseId: this.knowledgeBaseId,
      documentId: this.documentId,
      requestedGeneration: this.requestedGeneration,
      activeDocumentIndexId: this.activeDocumentIndexId,
      isEntry: this.isEntry,
      alwaysIncludeFullContent: this.alwaysIncludeFullContent,
      updatedAt: this.updatedAt,
      ...changes,
    })
  }

  private toDateTime(value: Date | DateTime): DateTime {
    try {
      return new DateTime(value)
    } catch (error) {
      if (!(error instanceof InvalidDateTimeException)) throw error

      throw new InvalidKnowledgeBaseDocumentStateException('updatedAt')
    }
  }
}
