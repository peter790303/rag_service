import { RagDocumentIndex } from '../../../Domain/Knowledge/rag-document-index.js'
import { RagDocumentIndexModel } from '../Models/rag-document-index.model.js'

export class RagDocumentIndexFactory {
  static toDomain(model: RagDocumentIndexModel): RagDocumentIndex {
    return new RagDocumentIndex({
      id: model.id,
      status: model.status,
      readyAt: model.readyAt,
      unreferencedSince: model.unreferencedSince,
    })
  }

  static applyLifecycle(index: RagDocumentIndex, model: RagDocumentIndexModel): RagDocumentIndexModel {
    model.status = index.status
    model.readyAt = index.readyAt
    model.unreferencedSince = index.unreferencedSince

    return model
  }
}
