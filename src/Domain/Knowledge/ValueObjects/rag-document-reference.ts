/** A canonical document path and optional heading anchor used to identify a reference. */
export class RagDocumentReference {
  readonly path: string

  readonly anchor: string | null

  private readonly normalizedAnchor: string | null

  constructor(path: string, anchor: string | null = null) {
    const normalizedPath = normalizeDocumentPath(path)

    if (!normalizedPath) throw new TypeError('A document reference requires a non-empty path')

    this.path = normalizedPath
    this.anchor = anchor?.trim() || path.split('|', 1)[0]?.split('#')[1]?.trim() || null
    this.normalizedAnchor = this.anchor === null ? null : normalizeAnchor(this.anchor)
    Object.freeze(this)
  }

  static tryCreate(path: string | null | undefined, anchor: string | null = null): RagDocumentReference | null {
    if (!path || !normalizeDocumentPath(path)) return null

    return new RagDocumentReference(path, anchor)
  }

  equals(other: RagDocumentReference): boolean {
    return this.path === other.path && this.normalizedAnchor === other.normalizedAnchor
  }

  refersToSameDocument(other: RagDocumentReference): boolean {
    return this.path === other.path
  }

  matchesHeadingPath(headingPath: readonly string[]): boolean {
    return (
      this.normalizedAnchor === null ||
      headingPath.some((heading) => normalizeAnchor(heading) === this.normalizedAnchor)
    )
  }
}

const normalizeDocumentPath = (sourcePath: string): string => {
  if (/^[a-z][a-z\d+.-]*:/i.test(sourcePath.trim())) return ''

  const path = sourcePath.split(/[|#?]/, 1)[0]?.trim().replaceAll('\\', '/') ?? ''

  return path
    .split('/')
    .reduce<string[]>((segments, segment) => {
      if (!segment || segment === '.') return segments

      if (segment === '..') return segments.slice(0, -1)

      return [...segments, segment]
    }, [])
    .join('/')
    .replace(/\.md$/i, '')
    .toLocaleLowerCase('en-US')
}

const normalizeAnchor = (value: string): string => {
  let decodedValue = value

  try {
    decodedValue = decodeURIComponent(value)
  } catch {
    // Keep the original anchor when a persisted reference has malformed escapes.
  }

  return decodedValue
    .replace(/^#+/, '')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
}
