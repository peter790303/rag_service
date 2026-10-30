import type { RetrievalDocumentDTO } from '../../../Documents/Application/DTOs/retrieval-document.dto.ts'
import type { DocumentRelation } from '../../Domain/Entities/document-relation.ts'
import type {
  RetrievalDocumentRelationResolutionView,
  RetrievalDocumentRelationView,
} from '../DTOs/retrieval-document-relation.dto.ts'

interface RetrievalDocumentRelationViewFacts {
  relation: DocumentRelation
  sourceDocument: RetrievalDocumentDTO
  resolution: RetrievalDocumentRelationResolutionView
}

export class RetrievalDocumentRelationAssembler {
  static toRetrievalDocumentRelation(
    retrievalDocumentRelationFacts: RetrievalDocumentRelationViewFacts,
  ): RetrievalDocumentRelationView {
    const { relation, sourceDocument, resolution } = retrievalDocumentRelationFacts

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
