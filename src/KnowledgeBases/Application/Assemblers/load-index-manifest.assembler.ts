import type { DocumentIndex } from '../../../DocumentIndexes/Domain/Entities/document-index.ts'
import type { DocumentRevision } from '../../../DocumentRevisions/Domain/Entities/document-revision.ts'
import type { Document } from '../../../Documents/Domain/Entities/document.ts'
import type { KnowledgeBaseDocument } from '../../../KnowledgeBaseDocuments/Domain/Entities/knowledge-base-document.ts'
import type {
  IndexManifestActiveIndex,
  IndexManifestDocument,
  IndexManifestIssue,
  IndexManifestProfile,
} from '../../Domain/ValueObjects/knowledge-base-index-manifest.ts'
import type { LoadIndexManifestQuery } from '../Queries/load-index-manifest.query.ts'
import type { KnowledgeBaseProjectQO } from '../QueryObjects/knowledge-base.query-object.ts'

export class LoadIndexManifestAssembler {
  /** Version 1 canonical tuples; callers provide inventory ordered by documentId. */
  static serializeIndexManifestHashInput(projectId: string, documents: readonly IndexManifestDocument[]): string {
    const rows = documents.map((document) => [
      document.documentId,
      document.requestedGeneration,
      document.isEntry,
      document.alwaysIncludeFullContent,
      document.activeDocumentIndexId,
      this.toIndexManifestActiveIndexHashTuple(document.activeIndex),
      [...document.issues],
    ])

    return JSON.stringify([1, projectId, rows])
  }

  static toKnowledgeBaseProjectQO(loadIndexManifestQuery: LoadIndexManifestQuery): KnowledgeBaseProjectQO {
    return { projectId: loadIndexManifestQuery.projectId }
  }

  static toIndexManifestDocument(
    membership: KnowledgeBaseDocument,
    document: Document | undefined,
    index: DocumentIndex | undefined,
    revision: DocumentRevision | undefined,
    issues: readonly IndexManifestIssue[],
  ): IndexManifestDocument {
    return {
      documentId: membership.documentId,
      sourceType: document?.sourceType ?? null,
      sourceKey: document?.sourceKey ?? null,
      sourcePath: document?.sourcePath ?? null,
      title: document?.currentTitle ?? null,
      requestedGeneration: membership.requestedGeneration,
      isEntry: membership.isEntry,
      alwaysIncludeFullContent: membership.alwaysIncludeFullContent,
      activeDocumentIndexId: membership.activeDocumentIndexId,
      activeIndex: this.toIndexManifestActiveIndex(index, revision),
      issues,
    }
  }

  private static toIndexManifestActiveIndexHashTuple(
    index: IndexManifestActiveIndex | null,
  ): readonly (string | number | null)[] | null {
    if (!index) return null

    return [
      index.documentIndexId,
      index.revisionId,
      index.contentSha256,
      index.status,
      index.pipelineHash,
      index.readyAt,
      index.profile.chunkingModel,
      index.profile.chunkingProfile,
      index.profile.embeddingModel,
      index.profile.embeddingDimensions,
      index.profile.embeddingProfile,
      index.profile.lexicalProfile,
      index.profile.relationProfile,
    ]
  }

  private static toIndexManifestActiveIndex(
    index: DocumentIndex | undefined,
    revision: DocumentRevision | undefined,
  ): IndexManifestActiveIndex | null {
    if (!index) return null

    return {
      documentIndexId: index.id,
      revisionId: index.revisionId,
      contentSha256: revision?.contentSha256 ?? null,
      status: index.status,
      pipelineHash: index.pipelineHash,
      readyAt: index.readyAt?.isoString ?? null,
      profile: this.toIndexManifestProfile(index),
    }
  }

  private static toIndexManifestProfile(index: DocumentIndex): IndexManifestProfile {
    return {
      chunkingModel: index.chunkingModel,
      chunkingProfile: index.chunkingProfile,
      embeddingModel: index.embeddingModel,
      embeddingDimensions: index.embeddingDimensions,
      embeddingProfile: index.embeddingProfile,
      lexicalProfile: index.lexicalProfile,
      relationProfile: index.relationProfile,
    }
  }
}
