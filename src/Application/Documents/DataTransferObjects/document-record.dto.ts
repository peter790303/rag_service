export type DocumentRecordDTO = {
  id: string
  sourceType: string
  sourceKey: string
  sourcePath: string
  currentTitle: string | null
  unreferencedSince: Date | null
  createdAt: Date
}
