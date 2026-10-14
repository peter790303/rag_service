import { createHash, randomUUID } from 'node:crypto'

import { RagCryptographyProvider } from '../../../../Application/KnowledgeBases/Contracts/rag-cryptography-provider.js'

export class NodeRagCryptographyAdapter extends RagCryptographyProvider {
  sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex')
  }

  generateIdempotencyKey(): string {
    return randomUUID()
  }

  generateLeaseToken(): string {
    return randomUUID()
  }
}
