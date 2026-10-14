import type { RetrievalSnapshot } from '../Contracts/rag-retrieval-store.js'
import type { RelationResolutionView, RelationView } from '../DataTransferObjects/retrieval-result.dto.js'

type RetrievalRelation = RetrievalSnapshot['relations'][number]
type RelationSourceDocument = RetrievalSnapshot['documents'][number]

export class RetrievalRelationViewAssembler {
  static toViewModel(input: {
    relation: RetrievalRelation
    sourceDocument: RelationSourceDocument
    resolution: RelationResolutionView
  }): RelationView {
    const { relation, sourceDocument } = input
    const { resolution } = input

    return {
      relationId: relation.id,
      relationType: resolution.relationType,
      sourceIndexId: relation.sourceIndexId,
      sourceDocumentReference: sourceDocument.sourcePath,
      targetDocumentReference: relation.targetReference,
      targetAnchor: resolution.targetAnchor,
      targetDocumentId: resolution.targetDocumentId,
      evidenceBlockStart: relation.evidenceBlockStart,
      evidenceBlockEnd: relation.evidenceBlockEnd,
      evidenceText: relation.evidenceText,
      resolution: resolution.resolution,
      candidateCount: resolution.candidateCount,
    }
  }
}
