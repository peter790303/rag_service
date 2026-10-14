import { Injectable } from '@nestjs/common'

import {
  RagLexicalSearchFormatter,
  type RagLexicalSearchRepresentation,
} from '../../../Application/KnowledgeBases/Contracts/rag-lexical-search-formatter.js'
import { LEXICAL_PROFILE_VERSION, RagLexicalQuery } from '../../../Domain/Knowledge/ValueObjects/rag-lexical-query.js'

export { LEXICAL_PROFILE_VERSION } from '../../../Domain/Knowledge/ValueObjects/rag-lexical-query.js'

@Injectable()
export class PersistenceRagLexicalSearchFormatter extends RagLexicalSearchFormatter {
  format(text: string): RagLexicalSearchRepresentation {
    const query = RagLexicalQuery.fromText(text)

    return {
      profileVersion: LEXICAL_PROFILE_VERSION,
      terms: query.terms,
      searchText: query.toSearchText(),
    }
  }
}
