import { createHash } from 'node:crypto'

import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import {
  KnowledgeBaseIndexManifest,
  type IndexManifestIssue,
} from '../../../Domain/KnowledgeBase/ValueObjects/knowledge-base-index-manifest.ts'
import type { LoadRetrievalDocumentIndexesUseCaseContract } from '../../DocumentIndexes/Contracts/load-retrieval-document-indexes.use-case.contract.ts'
import type { LoadRetrievalDocumentRevisionsUseCaseContract } from '../../DocumentRevisions/Contracts/load-retrieval-document-revisions.use-case.contract.ts'
import type { LoadRetrievalDocumentsUseCaseContract } from '../../Documents/Contracts/load-retrieval-documents.use-case.contract.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsUseCaseContract } from '../../KnowledgeBaseDocuments/Contracts/load-retrieval-knowledge-base-documents.use-case.contract.ts'
import { LoadIndexManifestAssembler } from '../Assemblers/load-index-manifest.assembler.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../Contracts/persistence-transaction.ts'
import type { LoadIndexManifestDTO } from '../DataTransferObjects/load-index-manifest.dto.ts'

export class LoadIndexManifestUseCase {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly knowledgeBases: KnowledgeBaseRepository,
    private readonly memberships: LoadRetrievalKnowledgeBaseDocumentsUseCaseContract,
    private readonly documents: LoadRetrievalDocumentsUseCaseContract,
    private readonly indexes: LoadRetrievalDocumentIndexesUseCaseContract,
    private readonly revisions: LoadRetrievalDocumentRevisionsUseCaseContract,
  ) {}

  execute(loadIndexManifestDTO: LoadIndexManifestDTO): Promise<KnowledgeBase | null> {
    return this.transaction.runReadOnlySnapshot(() => this.load(loadIndexManifestDTO))
  }

  private async load(loadIndexManifestDTO: LoadIndexManifestDTO): Promise<KnowledgeBase | null> {
    const knowledgeBase = await this.knowledgeBases.findByProjectId(
      LoadIndexManifestAssembler.toKnowledgeBaseProjectQueryObject(loadIndexManifestDTO),
    )

    if (!knowledgeBase) return null

    knowledgeBase.assertProject(loadIndexManifestDTO.projectId)
    const memberships = (await this.memberships.execute({ knowledgeBaseId: knowledgeBase.id }))
      .filter((membership) => membership.knowledgeBaseId === knowledgeBase.id)
      .sort(KnowledgeBaseIndexManifest.compareDocumentsById)
    const documentIds = memberships.map((membership) => membership.documentId)
    const documents = new Map(
      (await this.documents.execute({ documentIds })).map((document) => [document.id, document]),
    )
    const indexes = new Map((await this.indexes.execute({ documentIds })).map((index) => [index.id, index]))
    const activeIndexes = memberships.flatMap((membership) => {
      const index = indexes.get(membership.activeDocumentIndexId ?? '')

      return index?.documentId === membership.documentId ? [index] : []
    })
    const revisionIds = [...new Set(activeIndexes.map((index) => index.revisionId))]
    const revisions = new Map(
      (await this.revisions.execute({ revisionIds })).map((revision) => [revision.id, revision]),
    )
    const inventory = memberships.map((membership) => {
      const document = documents.get(membership.documentId)
      const candidateIndex = indexes.get(membership.activeDocumentIndexId ?? '')
      const index = candidateIndex?.documentId === membership.documentId ? candidateIndex : undefined
      const candidateRevision = index ? revisions.get(index.revisionId) : undefined
      const revision = candidateRevision?.documentId === membership.documentId ? candidateRevision : undefined
      const issues: IndexManifestIssue[] = []

      if (!document) issues.push('document_unavailable')

      if (!membership.activeDocumentIndexId) issues.push('no_active_index')
      else if (!index) issues.push('active_index_unavailable')

      if (index && (index.status !== 'ready' || !index.readyAt)) issues.push('index_not_ready')

      if (index && !revision) issues.push('revision_unavailable')

      return LoadIndexManifestAssembler.toIndexManifestDocument(membership, document, index, revision, issues)
    })
    const activeIndexDigest = createHash('sha256')
      .update(LoadIndexManifestAssembler.serializeIndexManifestHashInput(knowledgeBase.projectId, inventory), 'utf8')
      .digest('hex')
    knowledgeBase.recordIndexManifest(inventory, activeIndexDigest)

    return knowledgeBase
  }
}
