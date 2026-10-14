export type RagServiceAuthCredentials = {
  body: unknown
  headerProjectId: string
  issuedAt: string
  method: string
  path: string
  projectId: string
  signature: string
}

export abstract class RagServiceAuthenticatorPort {
  abstract authenticate(credentials: RagServiceAuthCredentials): boolean
}
