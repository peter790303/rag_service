import { DocumentRelationTypeEnum } from './Enums/document-relation-type.enum.ts'
import { InvalidDocumentRelationStateException } from './Exceptions/invalid-document-relation-state.exception.ts'

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

  readonly evidenceBlockStart: number

  readonly evidenceBlockEnd: number

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

    if (!Number.isInteger(state.evidenceBlockStart) || state.evidenceBlockStart < 0)
      throw new InvalidDocumentRelationStateException('evidenceBlockStart')

    if (!Number.isInteger(state.evidenceBlockEnd) || state.evidenceBlockEnd < state.evidenceBlockStart)
      throw new InvalidDocumentRelationStateException('evidenceBlockEnd')

    if (typeof state.evidenceText !== 'string') throw new InvalidDocumentRelationStateException('evidenceText')

    this.id = state.id
    this.sourceIndexId = state.sourceIndexId
    this.targetDocumentId = state.targetDocumentId
    this.targetReference = state.targetReference
    this.targetAnchor = state.targetAnchor
    this.relationType = relationType
    this.evidenceBlockStart = state.evidenceBlockStart
    this.evidenceBlockEnd = state.evidenceBlockEnd
    this.evidenceText = state.evidenceText
  }
}
