import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { RAG_CONFIG, type RagConfig } from '../../../config/rag.config.js'

const MAX_CLOCK_SKEW_MS = 300_000

export type RagServiceAuthCredentials = {
  body: unknown
  headerProjectId: string
  issuedAt: string
  method: string
  path: string
  projectId: string
  signature: string
}

@Injectable()
export class RagServiceAuthenticator {
  constructor(@Inject(RAG_CONFIG) private readonly config: RagConfig) {}

  authenticate(credentials: RagServiceAuthCredentials): boolean {
    const timestamp = Number(credentials.issuedAt)

    if (
      !credentials.projectId ||
      credentials.headerProjectId !== credentials.projectId ||
      !/^\d{13}$/u.test(credentials.issuedAt) ||
      !Number.isSafeInteger(timestamp) ||
      Math.abs(Date.now() - timestamp) > MAX_CLOCK_SKEW_MS ||
      !/^[\da-f]{64}$/iu.test(credentials.signature)
    ) {
      return false
    }

    let serializedBody: string
    try {
      serializedBody = JSON.stringify(credentials.body ?? {}) ?? '{}'
    } catch {
      return false
    }

    const payloadHash = createHash('sha256').update(serializedBody).digest('hex')
    const canonicalRequest = [
      credentials.method,
      credentials.path,
      credentials.issuedAt,
      credentials.projectId,
      payloadHash,
    ].join('\n')
    const expectedSignature = createHmac('sha256', this.config.serviceAuthSecret).update(canonicalRequest).digest()
    const receivedSignature = Buffer.from(credentials.signature, 'hex')

    return (
      receivedSignature.length === expectedSignature.length && timingSafeEqual(expectedSignature, receivedSignature)
    )
  }
}
