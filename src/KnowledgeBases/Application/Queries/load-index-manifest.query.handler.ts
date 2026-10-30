import { createHash } from 'node:crypto'

import type { LoadIndexManifestQuery } from './load-index-manifest.query.ts'
import type { LoadRetrievalDocumentIndexesQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/load-retrieval-document-indexes.query.handler.contract.ts'
import type { LoadRetrievalDocumentRevisionsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-document-revisions.query.handler.contract.ts'
import type { LoadRetrievalDocumentsQueryHandlerContract } from '../../../Documents/Application/Contracts/load-retrieval-documents.query.handler.contract.ts'
import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import {
  KnowledgeBaseIndexManifest,
  type IndexManifestIssue,
} from '../../Domain/ValueObjects/knowledge-base-index-manifest.ts'
import { LoadIndexManifestAssembler } from '../Assemblers/load-index-manifest.assembler.ts'
import type { LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract } from '../Contracts/load-retrieval-knowledge-base-documents.query.handler.contract.ts'
import type { LoadIndexManifestDTO } from '../DataTransferObjects/load-index-manifest.dto.ts'
import type { KnowledgeBaseRepository } from '../Ports/Out/Repositories/knowledge-base.repository.ts'

export class LoadIndexManifestQueryHandler {
  constructor(
    private readonly transaction: PersistenceTransaction,
    private readonly knowledgeBases: KnowledgeBaseRepository,
    private readonly memberships: LoadRetrievalKnowledgeBaseDocumentsQueryHandlerContract,
    private readonly documents: LoadRetrievalDocumentsQueryHandlerContract,
    private readonly indexes: LoadRetrievalDocumentIndexesQueryHandlerContract,
    private readonly revisions: LoadRetrievalDocumentRevisionsQueryHandlerContract,
  ) {}

  execute(loadIndexManifestDTO: LoadIndexManifestQuery): Promise<KnowledgeBase | null> {
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
