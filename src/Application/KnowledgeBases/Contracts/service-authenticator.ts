import type { ServiceAuthCredentialsDto } from '../DataTransferObjects/service-auth-credentials.dto.ts'

export abstract class ServiceAuthenticator {
  abstract authenticate(credentials: ServiceAuthCredentialsDto): boolean
}
