import type { ServiceAuthCredentialsDTO } from '../../../DataTransferObjects/service-auth-credentials.dto.ts'

export abstract class ServiceAuthenticator {
  abstract authenticate(credentials: ServiceAuthCredentialsDTO): boolean
}
