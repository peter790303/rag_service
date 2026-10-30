import type { KnowledgeBase } from '../../../../KnowledgeBases/Domain/Entities/knowledge-base.ts'
import { InvalidKnowledgeBaseStateException } from '../../../../KnowledgeBases/Domain/Exceptions/invalid-knowledge-base-state.exception.ts'
import type {
  IndexManifestActiveIndex,
  IndexManifestDocument,
  IndexManifestProfile,
} from '../../../../KnowledgeBases/Domain/ValueObjects/knowledge-base-index-manifest.ts'

export type IndexManifestResponse = {
  schemaVersion: 1
  projectId: string
  scope: 'knowledge_base_memberships'
  consistency: 'repeatable_read'
  complete: true
  totalDocuments: number
  readyDocuments: number
  activeIndexDigest: { algorithm: 'sha256'; version: 1; value: string }
  documents: IndexManifestDocument[]
}

export class IndexManifestResource {
  static fromKnowledgeBase(knowledgeBase: KnowledgeBase): IndexManifestResponse {
    const manifest = knowledgeBase.indexManifest

    if (!manifest) throw new InvalidKnowledgeBaseStateException('indexManifest')

    return {
      schemaVersion: 1,
      projectId: knowledgeBase.projectId,
      scope: 'knowledge_base_memberships',
      consistency: 'repeatable_read',
      complete: true,
      totalDocuments: manifest.documents.length,
      readyDocuments: manifest.readyDocuments,
      activeIndexDigest: { algorithm: 'sha256', version: 1, value: manifest.activeIndexDigest },
      documents: manifest.documents.map((document) => this.toDocumentResource(document)),
    }
  }

  private static toDocumentResource(document: IndexManifestDocument): IndexManifestDocument {
    return {
      documentId: document.documentId,
      sourceType: document.sourceType,
      sourceKey: document.sourceKey,
      sourcePath: document.sourcePath,
      title: document.title,
      requestedGeneration: document.requestedGeneration,
      isEntry: document.isEntry,
      alwaysIncludeFullContent: document.alwaysIncludeFullContent,
      activeDocumentIndexId: document.activeDocumentIndexId,
      activeIndex: this.toActiveIndexResource(document.activeIndex),
      issues: [...document.issues],
    }
  }

  private static toActiveIndexResource(activeIndex: IndexManifestActiveIndex | null): IndexManifestActiveIndex | null {
    if (!activeIndex) return null

    return {
      documentIndexId: activeIndex.documentIndexId,
      revisionId: activeIndex.revisionId,
      contentSha256: activeIndex.contentSha256,
      status: activeIndex.status,
      pipelineHash: activeIndex.pipelineHash,
      readyAt: activeIndex.readyAt,
      profile: this.toProfileResource(activeIndex.profile),
    }
  }

  private static toProfileResource(profile: IndexManifestProfile): IndexManifestProfile {
    return {
      chunkingModel: profile.chunkingModel,
      chunkingProfile: profile.chunkingProfile,
      embeddingModel: profile.embeddingModel,
      embeddingDimensions: profile.embeddingDimensions,
      embeddingProfile: profile.embeddingProfile,
      lexicalProfile: profile.lexicalProfile,
      relationProfile: profile.relationProfile,
    }
  }
}
