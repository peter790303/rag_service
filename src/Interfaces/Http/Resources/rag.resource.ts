import type {
  RagIndexRequestResult,
  RagExecutionVerification,
  RagJobStatusDto,
  RetryFailedJobDto,
} from '../../../Application/KnowledgeBases/DataTransferObjects/rag.dto.js'
import type {
  NeighboringChunkView,
  RelationView,
  RetrievalFullContentDocumentView,
  RetrievalMatchView,
} from '../../../Application/KnowledgeBases/DataTransferObjects/retrieval-result.dto.js'

type HybridRetrievalResult = {
  matches: RetrievalMatchView[]
  fullContentDocuments: RetrievalFullContentDocumentView[]
}

export class RagIndexRequestResource {
  static from(result: RagIndexRequestResult): RagIndexRequestResult {
    return {
      documentId: result.documentId,
      revisionId: result.revisionId,
      documentIndexId: result.documentIndexId,
      jobId: result.jobId,
      generation: result.generation,
      reusedReadyIndex: result.reusedReadyIndex,
      blockedByFailedJob: result.blockedByFailedJob,
    }
  }
}

export class RagJobStatusResource {
  static from(result: RagJobStatusDto): RagJobStatusDto {
    return {
      activeIndex: RagJobStatusResource.toActiveIndex(result.activeIndex),
      requestedTarget: RagJobStatusResource.toRequestedTarget(result.requestedTarget),
    }
  }

  private static toActiveIndex(activeIndex: RagJobStatusDto['activeIndex']): RagJobStatusDto['activeIndex'] {
    if (activeIndex === null) return null

    return {
      id: activeIndex.id,
      status: activeIndex.status,
      readyAt: activeIndex.readyAt,
    }
  }

  private static toRequestedTarget(
    requestedTarget: RagJobStatusDto['requestedTarget'],
  ): RagJobStatusDto['requestedTarget'] {
    if (requestedTarget === null) return null

    return {
      indexId: requestedTarget.indexId,
      generation: requestedTarget.generation,
      state: requestedTarget.state,
      jobId: requestedTarget.jobId,
      failedJobId: requestedTarget.failedJobId,
      attempts: requestedTarget.attempts,
      errorCode: requestedTarget.errorCode,
      errorMessage: requestedTarget.errorMessage,
      executionVerification: RagJobStatusResource.toExecutionVerification(requestedTarget.executionVerification),
    }
  }

  private static toExecutionVerification(
    executionVerification: RagExecutionVerification | null,
  ): RagExecutionVerification | null {
    if (executionVerification === null) return null

    const resource: RagExecutionVerification = {
      stage: executionVerification.stage,
      completedUnits: executionVerification.completedUnits,
      totalUnits: executionVerification.totalUnits,
      verifiedAt: executionVerification.verifiedAt,
    }

    if (executionVerification.claimToken !== undefined) {
      resource.claimToken = executionVerification.claimToken
    }

    if (executionVerification.leaseExpiresAt !== undefined) {
      resource.leaseExpiresAt = executionVerification.leaseExpiresAt
    }

    return resource
  }
}

export class RetryFailedJobResource {
  static from(result: RetryFailedJobDto): RetryFailedJobDto {
    return {
      jobId: result.jobId,
      failedJobId: result.failedJobId,
      status: result.status,
      retryOfFailedJobId: result.retryOfFailedJobId,
    }
  }
}

export class HybridRetrievalResource {
  static from(result: HybridRetrievalResult): HybridRetrievalResult {
    return {
      matches: result.matches.map(HybridRetrievalResource.toMatch),
      fullContentDocuments: result.fullContentDocuments.map(HybridRetrievalResource.toFullContentDocument),
    }
  }

  private static toMatch(match: RetrievalMatchView): RetrievalMatchView {
    return {
      chunk: HybridRetrievalResource.toChunk(match.chunk),
      neighboringContext: {
        prevChunk: HybridRetrievalResource.toNeighboringChunk(match.neighboringContext.prevChunk),
        nextChunk: HybridRetrievalResource.toNeighboringChunk(match.neighboringContext.nextChunk),
      },
      matchType: match.matchType,
      semanticRank: match.semanticRank,
      lexicalRank: match.lexicalRank,
      rawSemanticScore: match.rawSemanticScore,
      rawLexicalScore: match.rawLexicalScore,
      relations: match.relations.map(HybridRetrievalResource.toRelation),
      score: match.score,
      rank: match.rank,
      isMandatoryContext: match.isMandatoryContext,
    }
  }

  private static toChunk(chunk: RetrievalMatchView['chunk']): RetrievalMatchView['chunk'] {
    return {
      id: chunk.id,
      projectId: chunk.projectId,
      documentReference: chunk.documentReference,
      documentTitle: chunk.documentTitle,
      source: chunk.source,
      contentVersion: chunk.contentVersion,
      isEffective: chunk.isEffective,
      heading: chunk.heading,
      chunkIndex: chunk.chunkIndex,
      totalChunks: chunk.totalChunks,
      headingPath: [...chunk.headingPath],
      content: chunk.content,
      tokenCount: chunk.tokenCount,
      indexedAt: chunk.indexedAt,
      chunkingStrategyId: chunk.chunkingStrategyId,
      startBlock: chunk.startBlock,
      embeddingModelId: chunk.embeddingModelId,
      embeddingVector: [...chunk.embeddingVector],
      activeDocumentIndexId: chunk.activeDocumentIndexId,
      documentRevisionId: chunk.documentRevisionId,
      searchVector: [...chunk.searchVector],
      prevChunkReference: chunk.prevChunkReference,
      nextChunkReference: chunk.nextChunkReference,
    }
  }

  private static toNeighboringChunk(chunk: NeighboringChunkView | null): NeighboringChunkView | null {
    if (chunk === null) return null

    return {
      chunkIndex: chunk.chunkIndex,
      heading: chunk.heading,
      content: chunk.content,
      reference: chunk.reference,
    }
  }

  private static toRelation(relation: RelationView): RelationView {
    return {
      relationId: relation.relationId,
      relationType: relation.relationType,
      sourceIndexId: relation.sourceIndexId,
      sourceDocumentReference: relation.sourceDocumentReference,
      targetDocumentReference: relation.targetDocumentReference,
      targetAnchor: relation.targetAnchor,
      targetDocumentId: relation.targetDocumentId,
      evidenceBlockStart: relation.evidenceBlockStart,
      evidenceBlockEnd: relation.evidenceBlockEnd,
      evidenceText: relation.evidenceText,
      resolution: relation.resolution,
      candidateCount: relation.candidateCount,
    }
  }

  private static toFullContentDocument(document: RetrievalFullContentDocumentView): RetrievalFullContentDocumentView {
    return {
      projectId: document.projectId,
      documentReference: document.documentReference,
      documentTitle: document.documentTitle,
      source: document.source,
      contentVersion: document.contentVersion,
      documentRevisionId: document.documentRevisionId,
      content: document.content,
    }
  }
}

export class PruneMembershipsResource {
  static from(result: { pruned: number }): { pruned: number } {
    return { pruned: result.pruned }
  }
}
