import type { DocumentRelation } from '../../../Domain/DocumentRelation/document-relation.ts'
import type { RetrievalDocumentDto } from '../../Documents/DataTransferObjects/retrieval-document.dto.ts'
import type {
  RetrievalDocumentRelationResolutionView,
  RetrievalDocumentRelationView,
} from '../DataTransferObjects/retrieval-document-relation.dto.ts'

interface RetrievalDocumentRelationViewFacts {
  relation: DocumentRelation
  sourceDocument: RetrievalDocumentDto
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
