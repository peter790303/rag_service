import { concatMap, filter, firstValueFrom, from, toArray } from 'rxjs'

import { DocumentRevision } from '../../../Domain/DocumentRevision/document-revision.ts'
import type { InspectDocumentIndexRetentionUseCaseContract } from '../../DocumentIndexes/Contracts/inspect-document-index-retention.use-case.contract.ts'
import { GarbageDocumentRevisionAssembler } from '../Assemblers/garbage-document-revision.assembler.ts'
import type { CollectDocumentRevisionGarbageUseCaseContract } from '../Contracts/collect-document-revision-garbage.use-case.contract.ts'
import type { DocumentRevisionRepository } from '../Contracts/document-revision.repository.ts'
import type {
  CollectDocumentRevisionGarbageDTO,
  DocumentRevisionGarbageScopeDTO,
} from '../DataTransferObjects/document-revision-garbage.dto.ts'
import { InvalidDocumentRevisionGarbageInputException } from '../Exceptions/invalid-document-revision-garbage-input.exception.ts'

export class CollectDocumentRevisionGarbageUseCase implements CollectDocumentRevisionGarbageUseCaseContract {
  constructor(
    private readonly documentRevisionRepository: DocumentRevisionRepository,
    private readonly indexRetention: InspectDocumentIndexRetentionUseCaseContract,
  ) {}

  async execute(collectDocumentRevisionGarbageDTO: CollectDocumentRevisionGarbageDTO): Promise<DocumentRevision[]> {
    if (!Array.isArray(collectDocumentRevisionGarbageDTO?.scope?.lockedDocumentIds))
      throw new InvalidDocumentRevisionGarbageInputException('scope.lockedDocumentIds')

    const { scope, candidates } = collectDocumentRevisionGarbageDTO

    if (!(scope.retentionCutoff instanceof Date) || !Number.isFinite(scope.retentionCutoff.getTime()))
      throw new InvalidDocumentRevisionGarbageInputException('scope.retentionCutoff')

    if (
      !Array.isArray(candidates) ||
      !Array.from(candidates).every((candidate) => candidate instanceof DocumentRevision)
    )
      throw new InvalidDocumentRevisionGarbageInputException('candidates')

    const collectRevision = (candidate: DocumentRevision): Promise<DocumentRevision | null> =>
      this.collectUnreferencedRevision(scope, candidate)
    const isCollectedRevision = (revision: DocumentRevision | null): revision is DocumentRevision => revision !== null

    return firstValueFrom(from(candidates).pipe(concatMap(collectRevision), filter(isCollectedRevision), toArray()))
  }

  private async collectUnreferencedRevision(
    scope: DocumentRevisionGarbageScopeDTO,
    candidate: DocumentRevision,
  ): Promise<DocumentRevision | null> {
    if (!scope.lockedDocumentIds.includes(candidate.documentId)) return null

    const revision = await this.documentRevisionRepository.lockByDocumentRevisionId(
      GarbageDocumentRevisionAssembler.toDocumentRevisionIdQueryObject(candidate.id),
    )

    if (!revision || !revision.isRetentionExpired(scope.retentionCutoff)) return null

    if (revision.id !== candidate.id || revision.documentId !== candidate.documentId) return null

    if (await this.indexRetention.execute(GarbageDocumentRevisionAssembler.toDocumentIndexRetentionDTO(revision.id)))
      return null

    await this.documentRevisionRepository.deleteByDocumentRevisionId(
      GarbageDocumentRevisionAssembler.toDocumentRevisionIdQueryObject(revision.id),
    )

    return revision
  }
}
