import { createHash, createHmac, timingSafeEqual } from 'node:crypto'

import { Inject, Injectable } from '@nestjs/common'

import { KNOWLEDGE_SERVICE_CONFIG, type KnowledgeServiceConfig } from '../../../../config/knowledge-service.config.ts'
import { type ServiceAuthCredentialsDTO } from '../../Application/DataTransferObjects/service-auth-credentials.dto.ts'
import { ServiceAuthenticator } from '../../Application/Ports/Out/Gateways/service-authenticator.ts'

const MAX_CLOCK_SKEW_MS = 300_000

@Injectable()
export class HmacProjectServiceAuthenticator extends ServiceAuthenticator {
  constructor(@Inject(KNOWLEDGE_SERVICE_CONFIG) private readonly serviceConfig: KnowledgeServiceConfig) {
    super()
  }

  authenticate(credentials: ServiceAuthCredentialsDTO): boolean {
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
    const expectedSignature = createHmac('sha256', this.serviceConfig.serviceAuthSecret)
      .update(canonicalRequest)
      .digest()
    const receivedSignature = Buffer.from(credentials.signature, 'hex')

    return (
      receivedSignature.length === expectedSignature.length && timingSafeEqual(expectedSignature, receivedSignature)
    )
  }
}
