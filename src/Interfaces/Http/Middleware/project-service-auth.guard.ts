import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common'

import { ServiceAuthenticator } from '../../../Application/KnowledgeBases/Contracts/service-authenticator.ts'
import { KNOWLEDGE_GRAPH_CATALOG_SCOPE } from '../../../Application/KnowledgeBases/knowledge-graph-catalog-scope.ts'

type ProjectServiceHttpRequest = {
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
export class ProjectServiceAuthGuard implements CanActivate {
  constructor(private readonly projectServiceAuthenticator: ServiceAuthenticator) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<ProjectServiceHttpRequest>()
    const projectId = this.projectIdFor(request)
    const authenticated = this.projectServiceAuthenticator.authenticate({
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

  private projectIdFor(request: ProjectServiceHttpRequest): string {
    const path = request.path.split('?')[0]

    if (path === '/v1/knowledge-graph/projects') {
      const headerProjectId = request.header('x-rag-project-id') ?? ''

      return headerProjectId === KNOWLEDGE_GRAPH_CATALOG_SCOPE ? headerProjectId : ''
    }

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
