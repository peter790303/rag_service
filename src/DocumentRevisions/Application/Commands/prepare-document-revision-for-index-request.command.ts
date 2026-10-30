export type PrepareDocumentRevisionForIndexRequestCommand = {
  readonly sourceDocument: { readonly title?: string | null; readonly content: string }
  readonly documentId: string
  readonly contentSha256: string
}
