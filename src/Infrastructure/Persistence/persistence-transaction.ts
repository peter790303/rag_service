import { AsyncLocalStorage } from 'node:async_hooks'

import { Injectable, Optional } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { DataSource, type EntityManager } from 'typeorm'

import { ReadonlyDataSourceRequiredException } from './Exceptions/readonly-data-source-required.exception.ts'
import { PersistenceTransaction as PersistenceTransactionContract } from '../../Application/KnowledgeBases/Contracts/persistence-transaction.ts'
import { RETRIEVAL_READONLY_DATA_SOURCE } from '../Providers/retrieval-readonly-data-source.options.ts'

/** One transaction resource per async execution, shared by all model repositories. */
@Injectable()
export class PersistenceTransaction extends PersistenceTransactionContract {
  private readonly transactionEntityManagerStorage = new AsyncLocalStorage<EntityManager>()

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @Optional() @InjectDataSource(RETRIEVAL_READONLY_DATA_SOURCE) private readonly readonlyDataSource?: DataSource,
  ) {
    super()
  }

  get manager(): EntityManager {
    return this.transactionEntityManagerStorage.getStore() ?? this.dataSource.manager
  }

  async run<T>(operation: () => Promise<T>): Promise<T> {
    if (this.transactionEntityManagerStorage.getStore()) return operation()

    return this.dataSource.transaction((manager) => this.bind(manager, operation))
  }

  async runReadOnlySnapshot<T>(operation: () => Promise<T>): Promise<T> {
    if (!this.readonlyDataSource) throw new ReadonlyDataSourceRequiredException()

    const manager = this.transactionEntityManagerStorage.getStore()

    if (manager?.connection === this.readonlyDataSource && manager.queryRunner?.isTransactionActive) {
      return operation()
    }

    return this.readonlyDataSource.manager.transaction('REPEATABLE READ', (snapshotManager) =>
      this.bind(snapshotManager, operation),
    )
  }

  /** Infrastructure-only binding for an existing read-only snapshot transaction. */
  bind<T>(manager: EntityManager, operation: () => Promise<T>): Promise<T> {
    return this.transactionEntityManagerStorage.run(manager, operation)
  }
}
