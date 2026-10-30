import type { MarkdownChunkPlan } from '../DTOs/markdown-chunk-plan.dto.ts'

export type ReplaceIndexChunkCommand = {
  job: {
    readonly id: string
    readonly knowledgeBaseId: string
    readonly documentId: string
    readonly documentIndexId: string
    readonly generation: string
    readonly attempts: number
    readonly leaseToken: string
    readonly leaseExpiresAt: Date
  }
  markdownChunkPlan: MarkdownChunkPlan
  chunkEmbeddings: readonly number[][]
  now: Date
}
