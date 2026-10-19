import type { ReplacePlannedDocumentRelationsInputDTO } from '../DataTransferObjects/replace-planned-document-relations-input.dto.ts'

/** Replaces the relation plan owned by one document index. */
export abstract class ReplacePlannedDocumentRelationsUseCaseContract {
  abstract execute(replacePlannedDocumentRelationsInputDTO: ReplacePlannedDocumentRelationsInputDTO): Promise<void>
}
