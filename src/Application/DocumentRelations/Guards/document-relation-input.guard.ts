import { InvalidDocumentRelationInputException } from '../Exceptions/invalid-document-relation-input.exception.ts'

/** Validates use-case request shape before any repository operation begins. */
export class DocumentRelationInputGuard {
  static assertObject(input: unknown, field = 'input'): asserts input is Record<string, unknown> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new InvalidDocumentRelationInputException(field)
    }
  }

  static assertIdentifier(value: unknown, field: string): asserts value is string {
    if (typeof value !== 'string' || !value.trim()) {
      throw new InvalidDocumentRelationInputException(field)
    }
  }

  static assertIdentifierList(value: unknown, field: string): asserts value is readonly string[] {
    if (
      !Array.isArray(value) ||
      Array.from(value).some((identifier) => typeof identifier !== 'string' || !identifier.trim())
    ) {
      throw new InvalidDocumentRelationInputException(field)
    }
  }
}
