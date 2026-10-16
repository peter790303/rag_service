import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { ServiceAuthenticator } from '../../Application/KnowledgeBases/Contracts/service-authenticator.ts'
import { HmacProjectServiceAuthenticator } from '../Auth/hmac-project-service.authenticator.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [
    HmacProjectServiceAuthenticator,
    { provide: ServiceAuthenticator, useExisting: HmacProjectServiceAuthenticator },
  ],
  exports: [ServiceAuthenticator],
})
export class ServiceAuthenticationModule {}
