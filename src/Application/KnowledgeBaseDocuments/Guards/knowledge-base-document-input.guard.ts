import { InvalidKnowledgeBaseDocumentInputException } from '../Exceptions/invalid-knowledge-base-document-input.exception.ts'

/** Checks request fields before a repository lookup can erase their absence. */
export class KnowledgeBaseDocumentInputGuard {
  static assertObject(input: unknown, field = 'input'): asserts input is Record<string, unknown> {
    if (input === null || typeof input !== 'object' || Array.isArray(input)) {
      throw new InvalidKnowledgeBaseDocumentInputException(field)
    }
  }

  static assertSource(knowledgeBaseId: string, documentId: string): void {
    if (typeof knowledgeBaseId !== 'string' || !knowledgeBaseId.trim()) {
      throw new InvalidKnowledgeBaseDocumentInputException('knowledgeBaseId')
    }

    if (typeof documentId !== 'string' || !documentId.trim()) {
      throw new InvalidKnowledgeBaseDocumentInputException('documentId')
    }
  }

  static assertConfiguration(isEntry: boolean | undefined, alwaysIncludeFullContent: boolean | undefined): void {
    if (isEntry !== undefined && typeof isEntry !== 'boolean') {
      throw new InvalidKnowledgeBaseDocumentInputException('isEntry')
    }

    if (alwaysIncludeFullContent !== undefined && typeof alwaysIncludeFullContent !== 'boolean') {
      throw new InvalidKnowledgeBaseDocumentInputException('alwaysIncludeFullContent')
    }
  }

  static assertActivation(
    generation: string,
    expectedActiveDocumentIndexId: string | null,
    documentIndexId: string,
  ): void {
    if (typeof generation !== 'string' || !/^(0|[1-9][0-9]*)$/.test(generation)) {
      throw new InvalidKnowledgeBaseDocumentInputException('generation')
    }

    if (
      expectedActiveDocumentIndexId !== null &&
      (typeof expectedActiveDocumentIndexId !== 'string' || !expectedActiveDocumentIndexId.trim())
    ) {
      throw new InvalidKnowledgeBaseDocumentInputException('expectedActiveDocumentIndexId')
    }

    if (typeof documentIndexId !== 'string' || !documentIndexId.trim()) {
      throw new InvalidKnowledgeBaseDocumentInputException('documentIndexId')
    }
  }
}
