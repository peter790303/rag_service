import type { DocumentIndexExecutionStageEnum } from '../Enums/document-index-execution-stage.enum.ts'

export type DocumentIndexingProgressDTO = {
  stage: DocumentIndexExecutionStageEnum
  completedUnits: number
  totalUnits: number | null
}
