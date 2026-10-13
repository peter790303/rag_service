import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { RagServiceAuthenticator } from '../../../Infrastructure/Auth/rag-service-authenticator.js'

type ScopedRequest = {
  readonly body?: unknown
  readonly method: string
  readonly params: Record<string, unknown>
  readonly path: string
  readonly query: Record<string, unknown>
  header(name: string): string | undefined
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

@Injectable()
export class RagServiceAuthGuard implements CanActivate {
  constructor(private readonly authenticator: RagServiceAuthenticator) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ScopedRequest>()
    const projectId = this.projectIdFor(request)
    const authenticated = this.authenticator.authenticate({
      body: request.body,
      headerProjectId: request.header('x-rag-project-id') ?? '',
      issuedAt: request.header('x-rag-issued-at') ?? '',
      method: request.method,
      path: request.path,
      projectId,
      signature: request.header('x-rag-signature') ?? '',
    })

    if (!authenticated) throw new UnauthorizedException('A valid project-scoped service credential is required')

    return authenticated
  }

  private projectIdFor(request: ScopedRequest): string {
    const routeProjectId = typeof request.params.projectId === 'string' ? request.params.projectId : ''
    const bodyProjectId =
      isRecord(request.body) && typeof request.body.projectId === 'string' ? request.body.projectId : ''
    const queryProjectId = typeof request.query.projectId === 'string' ? request.query.projectId : ''

    return routeProjectId || bodyProjectId || queryProjectId
  }
}
