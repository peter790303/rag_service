import type { KnowledgeBaseDocument } from '../../../../Domain/Entities/knowledge-base-document.ts'
import type { KnowledgeBaseDocumentActivationQO } from '../../../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentActiveIndexQO } from '../../../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentDocumentQO } from '../../../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentKnowledgeBaseQO } from '../../../QueryObjects/knowledge-base-document.query-object.ts'
import type { KnowledgeBaseDocumentSourceQO } from '../../../QueryObjects/knowledge-base-document.query-object.ts'
import type {
  InsertKnowledgeBaseDocumentQO,
  UpdateKnowledgeBaseDocumentQO,
  UpdateKnowledgeBaseDocumentActiveIndexQO,
  UpdateKnowledgeBaseDocumentRequestQO,
} from '../../../QueryObjects/knowledge-base-document.query-object.ts'

export abstract class KnowledgeBaseDocumentRepository {
  abstract findByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null>

  abstract lockByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null>

  abstract lockByKnowledgeBaseIdAndDocumentIdSkipLocked(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<KnowledgeBaseDocument | null>

  abstract insert(insertKnowledgeBaseDocumentQO: InsertKnowledgeBaseDocumentQO): Promise<void>

  abstract updateByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentQO: UpdateKnowledgeBaseDocumentQO,
  ): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentId(
    updateKnowledgeBaseDocumentActiveIndexQO: UpdateKnowledgeBaseDocumentActiveIndexQO,
  ): Promise<void>

  abstract removeByKnowledgeBaseIdAndDocumentId(
    knowledgeBaseDocumentSourceQO: KnowledgeBaseDocumentSourceQO,
  ): Promise<void>

  abstract updateActiveDocumentIndexByKnowledgeBaseIdAndDocumentIdAndRequestedGenerationAndActiveDocumentIndexId(
    knowledgeBaseDocumentActivationQO: KnowledgeBaseDocumentActivationQO,
  ): Promise<KnowledgeBaseDocument | null>

  abstract updateRequest(updateKnowledgeBaseDocumentRequestQO: UpdateKnowledgeBaseDocumentRequestQO): Promise<void>

  abstract findByActiveDocumentIndexId(
    knowledgeBaseDocumentActiveIndexQO: KnowledgeBaseDocumentActiveIndexQO,
  ): Promise<KnowledgeBaseDocument | null>

  abstract findByKnowledgeBaseIdOrderByDocumentIdAsc(
    knowledgeBaseDocumentKnowledgeBaseQO: KnowledgeBaseDocumentKnowledgeBaseQO,
  ): Promise<KnowledgeBaseDocument[]>

  abstract findByDocumentId(
    knowledgeBaseDocumentDocumentQO: KnowledgeBaseDocumentDocumentQO,
  ): Promise<KnowledgeBaseDocument | null>
}
