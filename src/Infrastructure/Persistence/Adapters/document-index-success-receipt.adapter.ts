import type { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity.js'

import type { DocumentIndexSuccessReceiptDTO } from '../../../Application/DocumentIndexes/DataTransferObjects/document-index-success-receipt.dto.ts'
import type { ArchiveDocumentIndexSuccessQueryObject } from '../../../Application/DocumentIndexes/QueryObjects/document-index-success.query-object.ts'
import { InvalidDocumentIndexSuccessReceiptException } from '../Exceptions/invalid-document-index-success-receipt.exception.ts'
import type { DocumentIndexSuccessReceiptModel } from '../Models/document-index-success-receipt.model.ts'

/** Copies the immutable technical success receipt without exposing ORM state. */
export class DocumentIndexSuccessReceiptAdapter {
  static toPersistence(
    receipt: ArchiveDocumentIndexSuccessQueryObject,
  ): QueryDeepPartialEntity<DocumentIndexSuccessReceiptModel> {
    DocumentIndexSuccessReceiptAdapter.assertValid(receipt)

    // Validated evidence JSON must be stored atomically rather than recursively patched.
    return structuredClone(receipt) as QueryDeepPartialEntity<DocumentIndexSuccessReceiptModel>
  }

  static toDTO(model: DocumentIndexSuccessReceiptModel): DocumentIndexSuccessReceiptDTO {
    this.assertValid(model)

    return {
      jobId: model.jobId,
      projectId: model.projectId,
      knowledgeBaseId: model.knowledgeBaseId,
      documentId: model.documentId,
      documentIndexId: model.documentIndexId,
      generation: model.generation,
      attempts: model.attempts,
      executionVerification: model.executionVerification === null ? null : structuredClone(model.executionVerification),
      completedAt: new Date(model.completedAt.getTime()),
    }
  }

  static assertValid(receipt: {
    attempts: number | null
    completedAt: Date | null
    executionVerification: Record<string, unknown> | null
  }): void {
    if (
      !Number.isInteger(receipt.attempts) ||
      receipt.attempts === null ||
      receipt.attempts < 0 ||
      receipt.attempts > 4 ||
      !(receipt.completedAt instanceof Date) ||
      !Number.isFinite(receipt.completedAt.getTime())
    ) {
      throw new InvalidDocumentIndexSuccessReceiptException()
    }
  }

  static toNullableDTO(model: DocumentIndexSuccessReceiptModel | null): DocumentIndexSuccessReceiptDTO | null {
    return model === null ? null : this.toDTO(model)
  }
}
