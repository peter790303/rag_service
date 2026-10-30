import type { ReplacePlannedDocumentRelationsCommand } from '../Commands/replace-planned-document-relations.command.ts'

/** Replaces the relation plan owned by one document index. */
export abstract class ReplacePlannedDocumentRelationsCommandHandlerContract {
  abstract execute(replacePlannedDocumentRelationsCommand: ReplacePlannedDocumentRelationsCommand): Promise<void>
}
