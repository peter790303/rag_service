import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import type { CollectDocumentRevisionGarbageCommand } from './collect-document-revision-garbage.command.ts'
import type { InspectDocumentIndexRetentionQueryHandlerContract } from '../../../DocumentIndexes/Application/Contracts/inspect-document-index-retention.query.handler.contract.ts'
import { DocumentRevision } from '../../Domain/Entities/document-revision.ts'
import { GarbageDocumentRevisionAssembler } from '../Assemblers/garbage-document-revision.assembler.ts'
import type { CollectDocumentRevisionGarbageCommandHandlerContract } from '../Contracts/collect-document-revision-garbage.command.handler.contract.ts'
import type { DocumentRevisionGarbageScopeDTO } from '../DTOs/document-revision-garbage.dto.ts'
import { InvalidDocumentRevisionGarbageInputException } from '../Exceptions/invalid-document-revision-garbage-input.exception.ts'
import type { DocumentRevisionRepository } from '../Ports/Out/Repositories/document-revision.repository.ts'

export class CollectDocumentRevisionGarbageCommandHandler implements CollectDocumentRevisionGarbageCommandHandlerContract {
  constructor(
    private readonly documentRevisionRepository: DocumentRevisionRepository,
    private readonly indexRetention: InspectDocumentIndexRetentionQueryHandlerContract,
  ) {}

  async execute(
    collectDocumentRevisionGarbageCommand: CollectDocumentRevisionGarbageCommand,
  ): Promise<DocumentRevision[]> {
    if (!Array.isArray(collectDocumentRevisionGarbageCommand?.scope?.lockedDocumentIds))
      throw new InvalidDocumentRevisionGarbageInputException('scope.lockedDocumentIds')

    const { scope, candidates } = collectDocumentRevisionGarbageCommand

    if (!(scope.retentionCutoff instanceof Date) || !Number.isFinite(scope.retentionCutoff.getTime()))
      throw new InvalidDocumentRevisionGarbageInputException('scope.retentionCutoff')

    if (
      !Array.isArray(candidates) ||
      !Array.from(candidates).every(
        (candidate) =>
          candidate !== null &&
          typeof candidate === 'object' &&
          typeof candidate.id === 'string' &&
          Boolean(candidate.id.trim()) &&
          typeof candidate.documentId === 'string' &&
          Boolean(candidate.documentId.trim()),
      )
    )
      throw new InvalidDocumentRevisionGarbageInputException('candidates')

    const collectRevision = (
      candidate: CollectDocumentRevisionGarbageCommand['candidates'][number],
    ): Promise<DocumentRevision | null> => this.collectUnreferencedRevision(scope, candidate)
    const isCollectedRevision = (revision: DocumentRevision | null): revision is DocumentRevision => revision !== null

    return firstValueFrom(from(candidates).pipe(concatMap(collectRevision), filter(isCollectedRevision), toArray()))
  }

  private async collectUnreferencedRevision(
    scope: DocumentRevisionGarbageScopeDTO,
    candidate: CollectDocumentRevisionGarbageCommand['candidates'][number],
  ): Promise<DocumentRevision | null> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return null

    const revision = await this.documentRevisionRepository.lockByDocumentRevisionId(
      GarbageDocumentRevisionAssembler.toDocumentRevisionIdQO(candidate.id),
    )

    if (!revision || !revision.isRetentionExpired(scope.retentionCutoff)) return null

    if (revision.id !== candidate.id || revision.documentId !== candidate.documentId) return null

    if (
      await this.indexRetention.execute(
        GarbageDocumentRevisionAssembler.toInspectDocumentIndexRetentionQuery(revision.id),
      )
    )
      return null

    await this.documentRevisionRepository.deleteByDocumentRevisionId(
      GarbageDocumentRevisionAssembler.toDocumentRevisionIdQO(revision.id),
    )

    return revision
  }
}
