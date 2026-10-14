export const RagRelationType = {
  MARKDOWN_LINK: 'markdown_link',
  WIKI_LINK: 'wiki_link',
} as const

export type RagRelationType = (typeof RagRelationType)[keyof typeof RagRelationType]
