import { randomUUID } from 'node:crypto'

import type { PrepareDocumentRevisionForIndexRequestCommand } from '../../../DocumentRevisions/Application/Commands/prepare-document-revision-for-index-request.command.ts'
import type { PrepareDocumentForIndexRequestCommand } from '../../../Documents/Application/Commands/prepare-document-for-index-request.command.ts'
import type { SourceDocumentDTO } from '../../../Documents/Application/DataTransferObjects/source-document.dto.ts'
import type { PrepareKnowledgeBaseDocumentForIndexRequestCommand } from '../../../KnowledgeBaseDocuments/Application/Commands/prepare-knowledge-base-document-for-index-request.command.ts'
import type { EnsureIndexingKnowledgeBaseCommand } from '../../../KnowledgeBases/Application/Commands/ensure-indexing-knowledge-base.command.ts'
import type { DocumentIndex } from '../../Domain/Entities/document-index.ts'
import type { DocumentIndexExecutionRecordDTO } from '../DataTransferObjects/document-index-execution-record.dto.ts'
import type { DocumentIndexRequestExecution } from '../DataTransferObjects/document-index-request-facts.dto.ts'
import type { DocumentIndexRequestResult } from '../DataTransferObjects/document-index-request.dto.ts'
import { InvalidIndexPipelineInputException } from '../Exceptions/invalid-index-pipeline-input.exception.ts'
import { DOCUMENT_INDEX_EXECUTION_STATUS } from '../Helpers/document-index-execution-lifecycle.helper.ts'
import type { EnqueueDocumentIndexExecutionParams } from '../Ports/Out/Gateways/document-index-execution.params.ts'
import type { UnretriedDocumentIndexFailureTargetParams } from '../Ports/Out/Gateways/document-index-failure.params.ts'
import type { CreateBuildingDocumentIndexQO } from '../QueryObjects/document-index.query-object.ts'

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

  toEnsureIndexingKnowledgeBaseCommand(source: SourceDocumentDTO): EnsureIndexingKnowledgeBaseCommand {
    return { knowledgeBaseId: source.knowledgeBaseId, projectId: source.projectId, projectName: source.projectName }
  }

  toPrepareDocumentForIndexRequestCommand(source: SourceDocumentDTO): PrepareDocumentForIndexRequestCommand {
    return {
      knowledgeBaseId: source.knowledgeBaseId,
      projectId: source.projectId,
      projectName: source.projectName,
      sourceType: source.sourceType,
      sourceKey: source.sourceKey,
      sourcePath: source.sourcePath,
      content: source.content,
      ...('title' in source ? { title: source.title } : {}),
      ...('payload' in source ? { payload: source.payload } : {}),
      ...('isEntry' in source ? { isEntry: source.isEntry } : {}),
      ...('alwaysIncludeFullContent' in source ? { alwaysIncludeFullContent: source.alwaysIncludeFullContent } : {}),
    }
  }

  toPrepareKnowledgeBaseDocumentForIndexRequestCommand(
    source: SourceDocumentDTO,
    documentId: string,
  ): PrepareKnowledgeBaseDocumentForIndexRequestCommand {
    return {
      sourceDocument: {
        knowledgeBaseId: source.knowledgeBaseId,
        ...(source.isEntry === undefined ? {} : { isEntry: source.isEntry }),
        ...(source.alwaysIncludeFullContent === undefined
          ? {}
          : { alwaysIncludeFullContent: source.alwaysIncludeFullContent }),
      },
      documentId,
    }
  }

  toPrepareDocumentRevisionForIndexRequestCommand(
    source: SourceDocumentDTO,
    documentId: string,
    contentSha256: string,
  ): PrepareDocumentRevisionForIndexRequestCommand {
    return {
      sourceDocument: { ...(source.title === undefined ? {} : { title: source.title }), content: source.content },
      documentId,
      contentSha256,
    }
  }

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
    jobRecord: DocumentIndexExecutionRecordDTO | null,
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
  ): UnretriedDocumentIndexFailureTargetParams {
    const generation = String(requestedGeneration)

    return { knowledgeBaseId, documentId, documentIndexId, generation }
  }

  toBuildingDocumentIndex(documentIndex: DocumentIndex): CreateBuildingDocumentIndexQO {
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
    sourceDocument: PrepareDocumentForIndexRequestCommand & { readonly payload: Record<string, unknown> },
    documentId: string,
    documentIndexId: string,
    generation: string,
    availableAt: Date,
  ): EnqueueDocumentIndexExecutionParams {
    return {
      id: randomUUID(),
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
