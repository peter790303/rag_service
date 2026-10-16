import { InvalidMembershipInputException } from '../Exceptions/invalid-membership-input.exception.ts'

/** Checks request fields before a repository lookup can erase their absence. */
export class MembershipInputGuard {
  static assertSource(knowledgeBaseId: string, documentId: string): void {
    if (typeof knowledgeBaseId !== 'string' || !knowledgeBaseId.trim()) {
      throw new InvalidMembershipInputException('knowledgeBaseId')
    }

    if (typeof documentId !== 'string' || !documentId.trim()) {
      throw new InvalidMembershipInputException('documentId')
    }
  }

  static assertConfiguration(isEntry: boolean | undefined, alwaysIncludeFullContent: boolean | undefined): void {
    if (isEntry !== undefined && typeof isEntry !== 'boolean') {
      throw new InvalidMembershipInputException('isEntry')
    }

    if (alwaysIncludeFullContent !== undefined && typeof alwaysIncludeFullContent !== 'boolean') {
      throw new InvalidMembershipInputException('alwaysIncludeFullContent')
    }
  }

  static assertActivation(
    generation: string,
    expectedActiveDocumentIndexId: string | null,
    documentIndexId: string,
  ): void {
    if (typeof generation !== 'string' || !/^(0|[1-9][0-9]*)$/.test(generation)) {
      throw new InvalidMembershipInputException('generation')
    }

    if (
      expectedActiveDocumentIndexId !== null &&
      (typeof expectedActiveDocumentIndexId !== 'string' || !expectedActiveDocumentIndexId.trim())
    ) {
      throw new InvalidMembershipInputException('expectedActiveDocumentIndexId')
    }

    if (typeof documentIndexId !== 'string' || !documentIndexId.trim()) {
      throw new InvalidMembershipInputException('documentIndexId')
    }
  }
}
