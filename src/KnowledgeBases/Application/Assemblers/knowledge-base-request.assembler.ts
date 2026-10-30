import type { HybridRetrieveDTO } from '../DataTransferObjects/hybrid-retrieve.dto.ts'
import type { LoadIndexManifestDTO } from '../DataTransferObjects/load-index-manifest.dto.ts'
import type { LoadKnowledgeGraphDTO } from '../DataTransferObjects/load-knowledge-graph.dto.ts'
import type { LoadIndexManifestQuery } from '../Queries/load-index-manifest.query.ts'
import type { LoadKnowledgeGraphQuery } from '../Queries/load-knowledge-graph.query.ts'
import type { RetrieveKnowledgeBaseContentQuery } from '../Queries/retrieve-knowledge-base-content.query.ts'

export class KnowledgeBaseRequestAssembler {
  static toLoadIndexManifestQuery(requestDTO: LoadIndexManifestDTO): LoadIndexManifestQuery {
    return { projectId: requestDTO.projectId }
  }

  static toLoadKnowledgeGraphQuery(requestDTO: LoadKnowledgeGraphDTO): LoadKnowledgeGraphQuery {
    return {
      projectId: requestDTO.projectId,
      ...(requestDTO.documentId !== undefined ? { documentId: requestDTO.documentId } : {}),
      ...(requestDTO.query !== undefined ? { query: requestDTO.query } : {}),
      ...(requestDTO.limit !== undefined ? { limit: requestDTO.limit } : {}),
      ...(requestDTO.minSimilarity !== undefined ? { minSimilarity: requestDTO.minSimilarity } : {}),
    }
  }

  static toRetrieveKnowledgeBaseContentQuery(requestDTO: HybridRetrieveDTO): RetrieveKnowledgeBaseContentQuery {
    return {
      projectId: requestDTO.projectId,
      queryText: requestDTO.queryText,
      ...(requestDTO.queryVector !== undefined ? { queryVector: requestDTO.queryVector } : {}),
      ...(requestDTO.embeddingModelId !== undefined ? { embeddingModelId: requestDTO.embeddingModelId } : {}),
      ...(requestDTO.topK !== undefined ? { topK: requestDTO.topK } : {}),
      ...(requestDTO.limit !== undefined ? { limit: requestDTO.limit } : {}),
      ...(requestDTO.documentReference !== undefined ? { documentReference: requestDTO.documentReference } : {}),
      ...(requestDTO.includeNonEffective !== undefined ? { includeNonEffective: requestDTO.includeNonEffective } : {}),
    }
  }
}
