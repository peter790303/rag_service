import type { Chunk } from '../../../Domain/Chunk/chunk.ts'
import type { FindLexicalChunkCandidatesDTO } from '../DataTransferObjects/find-lexical-chunk-candidates.dto.ts'

/**
 * Matches terms inside the supplied active document indexes and returns raw lexical scores.
 * Candidates must be ordered by score DESC, then chunk id ASC, with limit applied in the database.
 * Matching, ranking and projection must use the caller's active read-only transaction snapshot.
 * Empty index scope, empty terms or a nonpositive limit produce no candidates.
 */
export abstract class FindLexicalChunkCandidatesUseCaseContract {
  abstract execute(findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesDTO): Promise<Chunk[]>
}
