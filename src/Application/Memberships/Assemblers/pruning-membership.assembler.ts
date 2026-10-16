import type { Membership } from '../../../Domain/Membership/membership.ts'
import type { StartDocumentIndexPruningRetentionDto } from '../../DocumentIndexes/DataTransferObjects/document-index-garbage.dto.ts'
import type { LockDocumentRetentionParentsDto } from '../../Documents/DataTransferObjects/document-retention-scope.dto.ts'
import type { StartDocumentPruningRetentionDto } from '../../Documents/DataTransferObjects/start-document-pruning-retention.dto.ts'
import type { KnowledgeBasePruningScopeDto } from '../../KnowledgeBases/DataTransferObjects/knowledge-base-pruning-scope.dto.ts'
import type { PruneKnowledgeBaseMembershipsDto } from '../DataTransferObjects/prune-knowledge-base-memberships.dto.ts'
import { MembershipPruningRequestedEvent } from '../Events/membership-pruning-requested.event.ts'
import type { MembershipKnowledgeBaseQueryObject } from '../QueryObjects/membership.query-object.ts'
import type {
  MembershipSourceQueryObject,
  UpdateMembershipActiveIndexQueryObject,
} from '../QueryObjects/membership.query-object.ts'

export class PruningMembershipAssembler {
  static toKnowledgeBasePruningScopeDTO(
    pruneKnowledgeBaseMembershipsDTO: PruneKnowledgeBaseMembershipsDto,
  ): KnowledgeBasePruningScopeDto {
    return {
      projectId: pruneKnowledgeBaseMembershipsDTO.projectId,
      knowledgeBaseId: pruneKnowledgeBaseMembershipsDTO.knowledgeBaseId,
    }
  }

  static toMembershipSourceQO(membership: Membership): MembershipSourceQueryObject {
    return {
      knowledgeBaseId: membership.knowledgeBaseId,
      documentId: membership.documentId,
    }
  }

  static toMembershipPruningRequestedEvent(membership: Membership): MembershipPruningRequestedEvent {
    return new MembershipPruningRequestedEvent(membership.knowledgeBaseId, membership.documentId)
  }

  static toUpdateDetachedMembershipQO(membership: Membership): UpdateMembershipActiveIndexQueryObject {
    return {
      knowledgeBaseId: membership.knowledgeBaseId,
      documentId: membership.documentId,
      activeDocumentIndexId: membership.activeDocumentIndexId,
      updatedAt: membership.updatedAt,
    }
  }

  static toStartDocumentIndexPruningRetentionDTO(
    documentIndexIds: ReadonlySet<string>,
    now: Date,
  ): StartDocumentIndexPruningRetentionDto {
    return { documentIndexIds: [...documentIndexIds], now }
  }

  static toStartDocumentPruningRetentionDTO(
    membership: Membership,
    now: Date,
    lockedDocumentIds: readonly string[],
  ): StartDocumentPruningRetentionDto {
    return { documentId: membership.documentId, now, lockedDocumentIds }
  }

  static toLockDocumentRetentionParentsDTO(memberships: readonly Membership[]): LockDocumentRetentionParentsDto {
    return { documentIds: memberships.map((candidate) => candidate.documentId) }
  }

  static toMembershipKnowledgeBaseQO(
    pruneKnowledgeBaseMembershipsDTO: PruneKnowledgeBaseMembershipsDto,
  ): MembershipKnowledgeBaseQueryObject {
    return { knowledgeBaseId: pruneKnowledgeBaseMembershipsDTO.knowledgeBaseId }
  }
}
