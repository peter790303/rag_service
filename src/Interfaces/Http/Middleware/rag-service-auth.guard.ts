import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { RagServiceAuthenticatorPort } from '../../../Application/KnowledgeBases/Contracts/rag-service-authenticator.js'

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
  constructor(private readonly authenticator: RagServiceAuthenticatorPort) {}

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
    const projectIds = [
      request.params.projectId,
      isRecord(request.body) ? request.body.projectId : undefined,
      request.query.projectId,
    ].filter((value) => value !== undefined)
    const projectId = projectIds[0]

    if (typeof projectId !== 'string' || projectId.length === 0) return ''

    if (projectIds.some((value) => value !== projectId)) return ''

    return projectId
  }
}
