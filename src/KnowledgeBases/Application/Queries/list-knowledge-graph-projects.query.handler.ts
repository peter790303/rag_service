import type { PersistenceTransaction } from '../../../Shared/Application/Ports/Out/Gateways/persistence-transaction.ts'
import type { KnowledgeBase } from '../../Domain/Entities/knowledge-base.ts'
import type { KnowledgeBaseRepository } from '../Ports/Out/Repositories/knowledge-base.repository.ts'

/** Read-only catalog of every knowledge base stored for the graph project selector. */
export class ListKnowledgeGraphProjectsQueryHandler {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly knowledgeBaseRepository: KnowledgeBaseRepository,
  ) {}

  execute(): Promise<readonly KnowledgeBase[]> {
    return this.persistenceTransaction.runReadOnlySnapshot(() => this.knowledgeBaseRepository.list())
  }
}
