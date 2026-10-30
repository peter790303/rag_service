import { Module } from '@nestjs/common'

import { KnowledgeServiceConfigModule } from './knowledge-service-config.module.ts'
import { ServiceAuthenticator } from '../../../Shared/Application/Ports/Out/Gateways/service-authenticator.ts'
import { HmacProjectServiceAuthenticator } from '../../../Shared/Infrastructure/Auth/hmac-project-service.authenticator.ts'

@Module({
  imports: [KnowledgeServiceConfigModule],
  providers: [
    HmacProjectServiceAuthenticator,
    { provide: ServiceAuthenticator, useExisting: HmacProjectServiceAuthenticator },
  ],
  exports: [ServiceAuthenticator],
})
export class ServiceAuthenticationModule {}
