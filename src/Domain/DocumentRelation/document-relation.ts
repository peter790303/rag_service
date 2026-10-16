import { DocumentRelationTypeEnum } from './Enums/document-relation-type.enum.ts'
import { InvalidDocumentRelationStateException } from './Exceptions/invalid-document-relation-state.exception.ts'
import { InvalidSourceLineRangeEndException } from '../DocumentRevision/Exceptions/invalid-source-line-range-end.exception.ts'
import { InvalidSourceLineRangeStartException } from '../DocumentRevision/Exceptions/invalid-source-line-range-start.exception.ts'
import { SourceLineRangeReversedException } from '../DocumentRevision/Exceptions/source-line-range-reversed.exception.ts'
import { SourceLineRange } from '../DocumentRevision/ValueObjects/source-line-range.ts'

export interface DocumentRelationState {
  readonly id: string
  readonly sourceIndexId: string
  readonly targetDocumentId: string | null
  readonly targetReference: string
  readonly targetAnchor: string | null
  readonly relationType: string
  readonly evidenceBlockStart: number
  readonly evidenceBlockEnd: number
  readonly evidenceText: string
}

/** An identified relation in a document index's persisted relation plan. */
export class DocumentRelation {
  readonly id: string

  readonly sourceIndexId: string

  readonly targetDocumentId: string | null

  readonly targetReference: string

  readonly targetAnchor: string | null

  readonly relationType: DocumentRelationTypeEnum

  private readonly evidenceRange: SourceLineRange

  readonly evidenceText: string

  constructor(state: DocumentRelationState) {
    if (typeof state.id !== 'string' || !state.id.trim()) throw new InvalidDocumentRelationStateException('id')

    if (typeof state.sourceIndexId !== 'string' || !state.sourceIndexId.trim())
      throw new InvalidDocumentRelationStateException('sourceIndexId')

    if (
      state.targetDocumentId !== null &&
      (typeof state.targetDocumentId !== 'string' || !state.targetDocumentId.trim())
    )
      throw new InvalidDocumentRelationStateException('targetDocumentId')

    if (typeof state.targetReference !== 'string' || !state.targetReference.trim())
      throw new InvalidDocumentRelationStateException('targetReference')

    if (state.targetAnchor !== null && typeof state.targetAnchor !== 'string')
      throw new InvalidDocumentRelationStateException('targetAnchor')

    const relationType = Object.values(DocumentRelationTypeEnum).find((type) => type === state.relationType)

    if (relationType === undefined) throw new InvalidDocumentRelationStateException('relationType')

    let evidenceRange: SourceLineRange

    try {
      evidenceRange = new SourceLineRange(state.evidenceBlockStart, state.evidenceBlockEnd)
    } catch (error) {
      if (error instanceof InvalidSourceLineRangeStartException)
        throw new InvalidDocumentRelationStateException('evidenceBlockStart')

      if (error instanceof InvalidSourceLineRangeEndException || error instanceof SourceLineRangeReversedException)
        throw new InvalidDocumentRelationStateException('evidenceBlockEnd')

      throw error
    }

    if (typeof state.evidenceText !== 'string') throw new InvalidDocumentRelationStateException('evidenceText')

    this.id = state.id
    this.sourceIndexId = state.sourceIndexId
    this.targetDocumentId = state.targetDocumentId
    this.targetReference = state.targetReference
    this.targetAnchor = state.targetAnchor
    this.relationType = relationType
    this.evidenceRange = evidenceRange
    this.evidenceText = state.evidenceText
  }

  get evidenceBlockStart(): number {
    return this.evidenceRange.startLine
  }

  get evidenceBlockEnd(): number {
    return this.evidenceRange.endLine
  }
}
