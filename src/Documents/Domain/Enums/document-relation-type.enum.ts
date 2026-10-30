export const DocumentRelationTypeEnum = {
  MARKDOWN_LINK: 'markdown_link',
  WIKI_LINK: 'wiki_link',
  REQUIRES: 'requires',
  APPLIES_TO: 'applies_to',
  OVERRIDES: 'overrides',
} as const

export type DocumentRelationTypeEnum = (typeof DocumentRelationTypeEnum)[keyof typeof DocumentRelationTypeEnum]
