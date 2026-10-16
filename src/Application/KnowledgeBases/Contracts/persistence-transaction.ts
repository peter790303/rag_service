/** Shared atomic boundary; repositories bind internally to its async execution. */
export abstract class PersistenceTransaction {
  abstract run<T>(operation: () => Promise<T>): Promise<T>

  abstract runReadOnlySnapshot<T>(operation: () => Promise<T>): Promise<T>
}
