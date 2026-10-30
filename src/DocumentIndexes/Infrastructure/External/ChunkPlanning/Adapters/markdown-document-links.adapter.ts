import type { MarkdownRelationSourceBlock } from './markdown-source.adapter.ts'
import type {
  PlannedDocumentRelation,
  PlannedDocumentRelationType,
} from '../../../../../Documents/Application/DataTransferObjects/planned-document-relation.dto.ts'

const wikiLink = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g
const markdownLink = /\[[^\]]*\]\(([^)#]+)(?:#([^)]*))?\)/g

/** Maps Markdown/wiki link syntax into source references with unmodified evidence. */
export class MarkdownDocumentLinksAdapter {
  static toRelations(blocks: readonly MarkdownRelationSourceBlock[]): PlannedDocumentRelation[] {
    return blocks.flatMap((block) => MarkdownDocumentLinksAdapter.extractRelations(block))
  }

  private static extractRelations(block: MarkdownRelationSourceBlock): PlannedDocumentRelation[] {
    return [
      ...[...block.relationText.matchAll(wikiLink)].flatMap((match) =>
        MarkdownDocumentLinksAdapter.toRelation(match, block, 'wiki_link'),
      ),
      ...[...block.relationText.matchAll(markdownLink)].flatMap((match) =>
        MarkdownDocumentLinksAdapter.toRelation(match, block, 'markdown_link'),
      ),
    ]
  }

  private static toRelation(
    match: RegExpMatchArray,
    block: MarkdownRelationSourceBlock,
    relationType: PlannedDocumentRelationType,
  ): PlannedDocumentRelation[] {
    const targetReference = match[1]

    if (!targetReference?.trim() || /^(?:https?:|mailto:|#)/i.test(targetReference.trim())) return []

    return [
      {
        targetReference,
        targetAnchor: match[2] ?? null,
        relationType,
        evidenceBlockStart: block.sourceBlock.startLine,
        evidenceBlockEnd: block.sourceBlock.endLine,
        evidenceText: block.sourceBlock.text,
      },
    ]
  }
}
