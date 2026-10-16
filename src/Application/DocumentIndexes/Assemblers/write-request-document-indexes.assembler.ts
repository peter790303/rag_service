import type { DocumentIndex } from '../../../Domain/DocumentIndex/document-index.ts'
import type { SourceDocumentDto } from '../../Documents/DataTransferObjects/source-document.dto.ts'
import type { DocumentIndexExecutionRecordDto } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexRequestExecution } from '../DataTransferObjects/document-index-request-facts.dto.ts'
import type { DocumentIndexRequestResult } from '../DataTransferObjects/document-index-request.dto.ts'
import { InvalidIndexPipelineInputException } from '../Exceptions/invalid-index-pipeline-input.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { EnqueueDocumentIndexExecutionQueryObject } from '../QueryObjects/document-index-execution.query-object.ts'
import type { UnretriedDocumentIndexFailureTargetQueryObject } from '../QueryObjects/document-index-failure.query-object.ts'
import type { CreateBuildingDocumentIndexQueryObject } from '../QueryObjects/document-index.query-object.ts'

export type DocumentIndexPipelineHashSource = {
  contentSha256: string
  embeddingModel: string
  embeddingDimensions: number
  chunkingModel: string
  context?: Record<string, unknown> | undefined
}

export type DocumentIndexPipelineHashInput = DocumentIndexPipelineHashSource & {
  embeddingProfile: string
  chunkingProfile: string
  lexicalProfile: string
  relationProfile: string
}

const canonicalize = (contextValue: unknown): unknown => {
  if (Array.isArray(contextValue)) return contextValue.map(canonicalize)

  if (contextValue !== null && typeof contextValue === 'object') {
    return Object.fromEntries(
      Object.entries(contextValue as Record<string, unknown>)
        .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
        .map(([contextKey, contextEntry]) => [contextKey, canonicalize(contextEntry)]),
    )
  }

  return contextValue
}

export const serializeDocumentIndexPipelineHashInput = (pipelineHashInput: DocumentIndexPipelineHashInput): string => {
  const serializedPipelineHashInput = JSON.stringify({
    contentSha256: pipelineHashInput.contentSha256,
    embeddingModel: pipelineHashInput.embeddingModel,
    embeddingDimensions: pipelineHashInput.embeddingDimensions,
    embeddingProfile: pipelineHashInput.embeddingProfile,
    chunkingModel: pipelineHashInput.chunkingModel,
    chunkingProfile: pipelineHashInput.chunkingProfile,
    lexicalProfile: pipelineHashInput.lexicalProfile,
    relationProfile: pipelineHashInput.relationProfile,
    context: canonicalize(pipelineHashInput.context ?? {}),
  })

  if (serializedPipelineHashInput === undefined) throw new InvalidIndexPipelineInputException()

  return serializedPipelineHashInput
}

export type DocumentIndexPipelineSettings = {
  embeddingModel: string
  embeddingDimensions: number
  chunkingModel: string
  chunkingProfile: string
  embeddingProfile: string
  lexicalProfile: string
  relationProfile: string
}

export type DocumentIndexPipelineIdentity = {
  contentSha256: string
  pipelineHash: string
}

export type DocumentIndexPipelineMetadata = DocumentIndexPipelineSettings & DocumentIndexPipelineIdentity

/** Maps configured pipeline metadata and a computed identity into the persistence shape. */
export class WriteRequestDocumentIndexesAssembler {
  constructor(private readonly pipelineSettings: DocumentIndexPipelineSettings) {}

  toDocumentIndexPipelineMetadata(pipelineIdentity: DocumentIndexPipelineIdentity): DocumentIndexPipelineMetadata {
    return {
      contentSha256: pipelineIdentity.contentSha256,
      pipelineHash: pipelineIdentity.pipelineHash,
      embeddingModel: this.pipelineSettings.embeddingModel,
      embeddingDimensions: this.pipelineSettings.embeddingDimensions,
      chunkingModel: this.pipelineSettings.chunkingModel,
      chunkingProfile: this.pipelineSettings.chunkingProfile,
      embeddingProfile: this.pipelineSettings.embeddingProfile,
      lexicalProfile: this.pipelineSettings.lexicalProfile,
      relationProfile: this.pipelineSettings.relationProfile,
    }
  }

  serializeDocumentIndexPipelineHashInput(pipelineHashSource: DocumentIndexPipelineHashSource): string {
    return serializeDocumentIndexPipelineHashInput({
      contentSha256: pipelineHashSource.contentSha256,
      embeddingModel: pipelineHashSource.embeddingModel,
      embeddingDimensions: pipelineHashSource.embeddingDimensions,
      chunkingModel: pipelineHashSource.chunkingModel,
      context: pipelineHashSource.context,
      embeddingProfile: this.pipelineSettings.embeddingProfile,
      chunkingProfile: this.pipelineSettings.chunkingProfile,
      lexicalProfile: this.pipelineSettings.lexicalProfile,
      relationProfile: this.pipelineSettings.relationProfile,
    })
  }

  toDocumentIndexRequestExecution(
    jobRecord: DocumentIndexExecutionRecordDto | null,
  ): DocumentIndexRequestExecution | null {
    if (jobRecord === null) return null

    const generation = jobRecord.generation

    return {
      id: jobRecord.id,
      documentIndexId: jobRecord.documentIndexId,
      generation,
      status: jobRecord.status,
    }
  }

  toUnretriedDocumentIndexFailureTargetQuery(
    knowledgeBaseId: string,
    documentId: string,
    documentIndexId: string,
    requestedGeneration: string,
  ): UnretriedDocumentIndexFailureTargetQueryObject {
    const generation = String(requestedGeneration)

    return { knowledgeBaseId, documentId, documentIndexId, generation }
  }

  toBuildingDocumentIndex(documentIndex: DocumentIndex): CreateBuildingDocumentIndexQueryObject {
    return {
      id: documentIndex.id,
      documentId: documentIndex.documentId,
      revisionId: documentIndex.revisionId,
      pipelineHash: documentIndex.pipelineHash,
      chunkingModel: documentIndex.chunkingModel,
      chunkingProfile: documentIndex.chunkingProfile,
      embeddingModel: documentIndex.embeddingModel,
      embeddingDimensions: documentIndex.embeddingDimensions,
      embeddingProfile: documentIndex.embeddingProfile,
      lexicalProfile: documentIndex.lexicalProfile,
      relationProfile: documentIndex.relationProfile,
      status: documentIndex.status,
      createdAt: documentIndex.createdAt.nativeDate,
      readyAt: documentIndex.readyAt?.nativeDate ?? null,
      unreferencedSince: documentIndex.unreferencedSince?.nativeDate ?? null,
    }
  }

  toQueuedDocumentIndexExecution(
    sourceDocument: SourceDocumentDto & { readonly payload: Record<string, unknown> },
    documentId: string,
    documentIndexId: string,
    generation: string,
    availableAt: Date,
  ): EnqueueDocumentIndexExecutionQueryObject {
    return {
      knowledgeBaseId: sourceDocument.knowledgeBaseId,
      documentId,
      documentIndexId,
      generation,
      status: DOCUMENT_INDEX_EXECUTION_STATUS.QUEUED,
      attempts: 0,
      availableAt,
      reservedAt: null,
      leaseToken: null,
      leaseExpiresAt: null,
      idempotencyKey: null,
      retryOfFailedJobId: null,
      executionState: null,
      executionVerification: null,
      payload: sourceDocument.payload,
    }
  }

  toDocumentIndexRequestResult(
    documentId: string,
    revisionId: string,
    documentIndexId: string,
    jobId: string | null,
    generation: string,
    reusedReadyIndex: boolean,
    blockedByFailedJob: boolean,
  ): DocumentIndexRequestResult {
    return { documentId, revisionId, documentIndexId, jobId, generation, reusedReadyIndex, blockedByFailedJob }
  }
}
