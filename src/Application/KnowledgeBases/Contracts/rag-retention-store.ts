import type { GarbageCollectionTransaction, MembershipPruneTransaction } from './rag-retention-operations.js'

/** Persistence boundary that keeps membership pruning inside one database transaction. */
export abstract class RagMembershipPruningStore {
  abstract withPruneTransaction<T>(work: (transaction: MembershipPruneTransaction) => Promise<T>): Promise<T>
}

/** Persistence boundary that keeps garbage collection writes inside one database transaction. */
export abstract class RagGarbageCollectionStore {
  abstract withGarbageCollectionTransaction<T>(
    work: (transaction: GarbageCollectionTransaction) => Promise<T>,
  ): Promise<T>
}
