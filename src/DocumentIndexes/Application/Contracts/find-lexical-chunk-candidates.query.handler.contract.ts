import type { Chunk } from '../../Domain/Entities/chunk.ts'
import type { FindLexicalChunkCandidatesQuery } from '../Queries/find-lexical-chunk-candidates.query.ts'

/**
 * Matches terms inside the supplied active document indexes and returns raw lexical scores.
 * Candidates must be ordered by score DESC, then chunk id ASC, with limit applied in the database.
 * Matching, ranking and projection must use the caller's active read-only transaction snapshot.
 * Empty index scope, empty terms or a nonpositive limit produce no candidates.
 */
export abstract class FindLexicalChunkCandidatesQueryHandlerContract {
  abstract execute(findLexicalChunkCandidatesDTO: FindLexicalChunkCandidatesQuery): Promise<Chunk[]>
}
