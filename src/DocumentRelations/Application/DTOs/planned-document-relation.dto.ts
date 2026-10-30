export type PlannedDocumentRelationType = 'markdown_link' | 'wiki_link' | 'requires' | 'applies_to' | 'overrides'

export interface PlannedDocumentRelation {
  targetReference: string
  targetAnchor: string | null
  relationType: PlannedDocumentRelationType
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
}
