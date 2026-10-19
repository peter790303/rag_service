import type { KnowledgeBaseDocument } from '../../../Domain/KnowledgeBaseDocument/knowledge-base-document.ts'
import type { KnowledgeBaseDocumentActivationQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentActiveIndexQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentDocumentQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentKnowledgeBaseQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentSourceQueryObject } from '../QueryObjects/knowledge-base-document.query-object.ts'
import type {
  InsertKnowledgeBaseDocumentQueryObject,
  UpdateKnowledgeBaseDocumentQueryObject,
  UpdateKnowledgeBaseDocumentActiveIndexQueryObject,
  UpdateKnowledgeBaseDocumentRequestQueryObject,
} from '../QueryObjects/knowledge-base-document.query-object.ts'

export abstract class KnowledgeBaseDocumentRepository {
  abstract findByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQueryObject,
  ): Promise<KnowledgeBaseDocument | null>

  abstract lockByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQueryObject,
  ): Promise<KnowledgeBaseDocument | null>

  abstract lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQueryObject,
  ): Promise<KnowledgeBaseDocument | null>

  abstract insert(insertKnowledgeBaseDocumentQO: InsertKnowledgeBaseDocumentQueryObject): Promise<void>

  abstract updateByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentQO: UpdateKnowledgeBaseDocumentQueryObject,
  ): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentActiveIndexQO: UpdateKnowledgeBaseDocumentActiveIndexQueryObject,
  ): Promise<void>

  abstract removeByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQueryObject,
  ): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
    knowledgeBaseDocumentActivationQO: KnowledgeBaseDocumentActivationQueryObject,
  ): Promise<KnowledgeBaseDocument | null>

  abstract updateRequest(
    updateKnowledgeBaseDocumentRequestQO: UpdateKnowledgeBaseDocumentRequestQueryObject,
  ): Promise<void>

  abstract findByActiveDocumentIndexId(
    knowledgeBaseDocumentActiveIndexQO: KnowledgeBaseDocumentActiveIndexQueryObject,
  ): Promise<KnowledgeBaseDocument | null>

  abstract findByKnowledgeBaseIdOrderByDocumentIdAsc(
    knowledgeBaseDocumentKnowledgeBaseQO: KnowledgeBaseDocumentKnowledgeBaseQueryObject,
  ): Promise<KnowledgeBaseDocument[]>

  abstract findByDocumentId(
    knowledgeBaseDocumentDocumentQO: KnowledgeBaseDocumentDocumentQueryObject,
  ): Promise<KnowledgeBaseDocument | null>
}
