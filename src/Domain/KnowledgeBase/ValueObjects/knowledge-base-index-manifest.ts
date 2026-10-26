import type { DocumentIndexStatus } from '../../DocumentIndex/Enums/document-index-status.enum.ts'
import { InvalidKnowledgeBaseStateException } from '../Exceptions/invalid-knowledge-base-state.exception.ts'

export type IndexManifestProfile = {
  readonly chunkingModel: string
  readonly chunkingProfile: string
  readonly embeddingModel: string
  readonly embeddingDimensions: number
  readonly embeddingProfile: string
  readonly lexicalProfile: string
  readonly relationProfile: string
}

export type IndexManifestActiveIndex = {
  readonly documentIndexId: string
  readonly revisionId: string
  readonly contentSha256: string | null
  readonly status: DocumentIndexStatus
  readonly pipelineHash: string
  readonly readyAt: string | null
  readonly profile: IndexManifestProfile
}

export type IndexManifestIssue =
  'document_unavailable' | 'no_active_index' | 'active_index_unavailable' | 'index_not_ready' | 'revision_unavailable'

export type IndexManifestDocument = {
  readonly documentId: string
  readonly sourceType: string | null
  readonly sourceKey: string | null
  readonly sourcePath: string | null
  readonly title: string | null
  readonly requestedGeneration: string
  readonly isEntry: boolean
  readonly alwaysIncludeFullContent: boolean
  readonly activeDocumentIndexId: string | null
  readonly activeIndex: IndexManifestActiveIndex | null
  readonly issues: readonly IndexManifestIssue[]
}

/** Complete persisted membership inventory, distinct from indexing readiness. */
export class KnowledgeBaseIndexManifest {
  readonly documents: readonly IndexManifestDocument[]

  readonly activeIndexDigest: string

  constructor(documents: readonly IndexManifestDocument[], activeIndexDigest: string) {
    if (
      new Set(documents.map((document) => document.documentId)).size !== documents.length ||
      !/^[a-f0-9]{64}$/.test(activeIndexDigest) ||
      documents.some(
        (document) =>
          !document.documentId ||
          !/^\d+$/.test(document.requestedGeneration) ||
          (document.activeIndex !== null && document.activeIndex.documentIndexId !== document.activeDocumentIndexId) ||
          (document.issues.length === 0 &&
            (!document.activeIndex ||
              document.activeIndex.status !== 'ready' ||
              !document.activeIndex.readyAt ||
              !document.activeIndex.contentSha256)),
      )
    )
      throw new InvalidKnowledgeBaseStateException('indexManifest')

    this.activeIndexDigest = activeIndexDigest
    this.documents = Object.freeze(documents.map(KnowledgeBaseIndexManifest.freezeDocument))
    Object.freeze(this)
  }

  static compareDocumentsById(
    leftDocument: Pick<IndexManifestDocument, 'documentId'>,
    rightDocument: Pick<IndexManifestDocument, 'documentId'>,
  ): number {
    if (leftDocument.documentId < rightDocument.documentId) return -1

    if (leftDocument.documentId > rightDocument.documentId) return 1

    return 0
  }

  private static freezeDocument(document: IndexManifestDocument): IndexManifestDocument {
    return Object.freeze({
      ...document,
      activeIndex: KnowledgeBaseIndexManifest.freezeActiveIndex(document.activeIndex),
      issues: Object.freeze([...document.issues]),
    })
  }

  private static freezeActiveIndex(activeIndex: IndexManifestActiveIndex | null): IndexManifestActiveIndex | null {
    if (!activeIndex) return null

    return Object.freeze({ ...activeIndex, profile: Object.freeze({ ...activeIndex.profile }) })
  }

  get readyDocuments(): number {
    return this.documents.filter((document) => document.issues.length === 0).length
  }
}
