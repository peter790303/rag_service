import type { ServiceAuthCredentialsDTO } from '../../../DTOs/service-auth-credentials.dto.ts'

export abstract class ServiceAuthenticator {
  abstract authenticate(credentials: ServiceAuthCredentialsDTO): boolean
}
