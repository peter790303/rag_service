import { IsNotEmpty, IsString } from 'class-validator'

import type { LoadIndexManifestDTO } from '../../../Application/KnowledgeBases/DataTransferObjects/load-index-manifest.dto.ts'

export class LoadIndexManifestRequest {
  @IsString() @IsNotEmpty() projectId!: string

  toDTO(): LoadIndexManifestDTO {
    return { projectId: this.projectId }
  }
}
