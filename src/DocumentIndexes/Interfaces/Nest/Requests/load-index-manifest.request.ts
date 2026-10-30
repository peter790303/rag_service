import { IsNotEmpty, IsString } from 'class-validator'

import type { LoadIndexManifestDTO } from '../../../../KnowledgeBases/Application/DTOs/load-index-manifest.dto.ts'

export class LoadIndexManifestRequest {
  @IsString() @IsNotEmpty() projectId!: string

  toDTO(): LoadIndexManifestDTO {
    return { projectId: this.projectId }
  }
}
