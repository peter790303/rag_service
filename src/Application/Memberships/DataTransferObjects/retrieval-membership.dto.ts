export type RetrievalMembershipDto = {
  documentId: string
  activeDocumentIndexId: string | null
  isEntry: boolean
  alwaysIncludeFullContent: boolean
}
