import { Module } from '@nestjs/common'

import { documentRelationsProviders } from './document-relations.providers.ts'
import { PersistenceModule } from './persistence.module.ts'
import { CollectDocumentRelationGarbageCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/collect-document-relation-garbage.command.handler.contract.ts'
import { InspectDocumentRelationRetentionQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/inspect-document-relation-retention.query.handler.contract.ts'
import { LoadRetrievalDocumentRelationsQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/load-retrieval-document-relations.query.handler.contract.ts'
import { PlanDocumentRelationGarbageQueryHandlerContract } from '../../../DocumentRelations/Application/Contracts/plan-document-relation-garbage.query.handler.contract.ts'
import { ReplacePlannedDocumentRelationsCommandHandlerContract } from '../../../DocumentRelations/Application/Contracts/replace-planned-document-relations.command.handler.contract.ts'

@Module({
  imports: [PersistenceModule],
  providers: documentRelationsProviders,
  exports: [
    ReplacePlannedDocumentRelationsCommandHandlerContract,
    CollectDocumentRelationGarbageCommandHandlerContract,
    InspectDocumentRelationRetentionQueryHandlerContract,
    PlanDocumentRelationGarbageQueryHandlerContract,
    LoadRetrievalDocumentRelationsQueryHandlerContract,
  ],
})
export class DocumentRelationsModule {}
