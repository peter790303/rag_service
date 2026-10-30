import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  DocumentRelation,
  type DocumentRelationState,
} from '../../../../src/Documents/Domain/Entities/document-relation.ts'
import { DocumentRelationTypeEnum } from '../../../../src/Documents/Domain/Enums/document-relation-type.enum.ts'
import { InvalidDocumentRelationStateException } from '../../../../src/Documents/Domain/Exceptions/invalid-document-relation-state.exception.ts'

const relationState = (overrides: Partial<DocumentRelationState> = {}): DocumentRelationState => ({
  id: 'relation-1',
  sourceIndexId: 'index-1',
  targetDocumentId: null,
  targetReference: '../Notes/Target.MD?view=full',
  targetAnchor: 'Heading%20One',
  relationType: DocumentRelationTypeEnum.MARKDOWN_LINK,
  evidenceBlockStart: 2,
  evidenceBlockEnd: 5,
  evidenceText: '[Target](../Notes/Target.MD?view=full#Heading%20One)',
  ...overrides,
})

const hasInvalidField =
  (field: string) =>
  (error: unknown): boolean =>
    error instanceof InvalidDocumentRelationStateException && error.field === field

describe('DocumentRelation source line range', () => {
  it('preserves primitive coordinates and raw reference evidence through its value object', () => {
    const state = relationState()
    const relation = new DocumentRelation(state)

    assert.equal(relation.evidenceBlockStart, state.evidenceBlockStart)
    assert.equal(relation.evidenceBlockEnd, state.evidenceBlockEnd)
    assert.equal(relation.targetReference, state.targetReference)
    assert.equal(relation.targetAnchor, state.targetAnchor)
    assert.equal(relation.evidenceText, state.evidenceText)
  })

  it('continues to allow zero and empty evidence ranges', () => {
    const relation = new DocumentRelation(relationState({ evidenceBlockStart: 0, evidenceBlockEnd: 0 }))

    assert.equal(relation.evidenceBlockStart, 0)
    assert.equal(relation.evidenceBlockEnd, 0)
  })

  it('retains the existing invalid-start field for all invalid start coordinates', () => {
    const invalidCoordinates = [-1, 1.5, NaN, Infinity, undefined, null, '1']

    invalidCoordinates.forEach((coordinate) => {
      assert.throws(
        () => new DocumentRelation(relationState({ evidenceBlockStart: coordinate as number })),
        hasInvalidField('evidenceBlockStart'),
      )
    })
  })

  it('retains the existing invalid-end field for invalid or reversed end coordinates', () => {
    const invalidCoordinates = [-1, 1, 1.5, NaN, Infinity, undefined, null, '3']

    invalidCoordinates.forEach((coordinate) => {
      assert.throws(
        () => new DocumentRelation(relationState({ evidenceBlockEnd: coordinate as number })),
        hasInvalidField('evidenceBlockEnd'),
      )
    })
  })

  it('keeps the original validation priority when multiple values are invalid', () => {
    assert.throws(
      () => new DocumentRelation(relationState({ evidenceBlockStart: -1, evidenceBlockEnd: -2 })),
      hasInvalidField('evidenceBlockStart'),
    )
    assert.throws(
      () => new DocumentRelation(relationState({ evidenceBlockEnd: 1, evidenceText: undefined as unknown as string })),
      hasInvalidField('evidenceBlockEnd'),
    )
    assert.throws(
      () => new DocumentRelation(relationState({ evidenceText: undefined as unknown as string })),
      hasInvalidField('evidenceText'),
    )
  })
})
