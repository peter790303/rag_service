import type { KnowledgeBase } from '../../../Domain/KnowledgeBase/knowledge-base.ts'
import type { KnowledgeBaseRepository } from '../Contracts/knowledge-base.repository.ts'
import type { PersistenceTransaction } from '../Contracts/persistence-transaction.ts'

/** Read-only catalog of every knowledge base stored for the graph project selector. */
export class ListKnowledgeGraphProjectsUseCase {
  constructor(
    private readonly persistenceTransaction: PersistenceTransaction,
    private readonly knowledgeBaseRepository: KnowledgeBaseRepository,
  ) {}

  execute(): Promise<readonly KnowledgeBase[]> {
    return this.persistenceTransaction.runReadOnlySnapshot(() => this.knowledgeBaseRepository.list())
  }
}
