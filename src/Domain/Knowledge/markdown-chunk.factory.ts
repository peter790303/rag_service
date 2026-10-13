export interface MarkdownSourceBlock {
  /** Zero-based position in the ordered source block list. */
  id: number
  /** Inclusive source character offset. */
  startOffset: number
  /** Exclusive source character offset. */
  endOffset: number
  /** Zero-based inclusive source line. */
  startLine: number
  /** Zero-based exclusive source line. */
  endLine: number
  /** Exact source slice, including original indentation and line endings. */
  text: string
  headingPath: string[]
}

export interface PlannedChunk {
  content: string
  headingPath: string[]
  blockStart: number
  blockEnd: number
  tokenCount: number
}

export type PlannedRelationType = 'references' | 'requires' | 'applies_to' | 'overrides'

export interface PlannedRelation {
  targetReference: string
  targetAnchor: string | null
  relationType: PlannedRelationType
  evidenceBlockStart: number
  evidenceBlockEnd: number
  evidenceText: string
}

export interface MarkdownPlan {
  chunks: PlannedChunk[]
  relations: PlannedRelation[]
}

interface SourceLine {
  text: string
  startOffset: number
  endOffset: number
}

interface Fence {
  character: '`' | '~'
  length: number
}

interface InternalBlock extends MarkdownSourceBlock {
  relationText: string
}

const wikiLink = /\[\[([^\]|#]+)(?:#([^\]|]+))?(?:\|[^\]]+)?\]\]/g
const markdownLink = /\[[^\]]*\]\(([^)#]+)(?:#([^)]*))?\)/g
const headingPattern = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const fencePattern = /^ {0,3}(`{3,}|~{3,})/
const listItemPattern = /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/

/**
 * Scans Markdown into ordered, legal block starts without normalizing the source.
 * Blocks form a contiguous partition: each block's text is the exact source slice
 * from its start offset through the next block start (or EOF).
 */
export class MarkdownChunkFactory {
  static readonly chunkingProfile = 'markdown-grounded-v2'

  static readonly relationProfile = 'markdown-links-anchored-v2'

  static scan(source: string): MarkdownSourceBlock[] {
    return MarkdownChunkFactory.scanInternal(source).map((block) => ({
      id: block.id,
      startOffset: block.startOffset,
      endOffset: block.endOffset,
      startLine: block.startLine,
      endLine: block.endLine,
      text: block.text,
      headingPath: block.headingPath,
    }))
  }

  /**
   * Builds chunks from model-selected block IDs. Chunk content is always copied
   * verbatim from the source; the IDs must be ordered, unique, and start at zero.
   */
  static plan(source: string, chunkStarts: readonly number[] = source.length > 0 ? [0] : []): MarkdownPlan {
    const blocks = MarkdownChunkFactory.scanInternal(source)

    if (!source.length) {
      if (chunkStarts.length) throw new RangeError('Empty Markdown cannot have chunk starts')

      return { chunks: [], relations: [] }
    }

    MarkdownChunkFactory.validateChunkStarts(chunkStarts, blocks.length)

    const chunks = chunkStarts.map((blockId, index) => {
      const firstBlock = blocks[blockId]
      const nextChunkBlock = blocks[chunkStarts[index + 1] ?? blocks.length]
      const lastBlock = blocks[(chunkStarts[index + 1] ?? blocks.length) - 1]

      if (!firstBlock || !lastBlock) throw new RangeError('Chunk start is outside scanned blocks')

      const endOffset = nextChunkBlock?.startOffset ?? source.length
      const content = source.slice(firstBlock.startOffset, endOffset)

      return {
        content,
        headingPath: firstBlock.headingPath,
        blockStart: firstBlock.startLine,
        blockEnd: lastBlock.endLine,
        tokenCount: Math.ceil(content.length / 4),
      }
    })

    return {
      chunks,
      relations: blocks.flatMap((block) => MarkdownChunkFactory.extractRelations(block)),
    }
  }

  private static scanInternal(source: string): InternalBlock[] {
    if (!source.length) return []

    const lines = MarkdownChunkFactory.splitLines(source)
    const boundaries = new Set<number>([0])
    const headingPathByLine: string[][] = []
    const relationEligibleByLine: boolean[] = []
    let headingPath: string[] = []
    let activeFence: Fence | null = null

    for (const [lineIndex, line] of lines.entries()) {
      const fenceMatch = fencePattern.exec(line.text)

      if (activeFence) {
        headingPathByLine.push(headingPath.slice())
        relationEligibleByLine.push(false)

        if (MarkdownChunkFactory.isClosingFence(line.text, activeFence)) activeFence = null

        continue
      }

      const heading = headingPattern.exec(line.text)
      const headingMarks = heading?.[1]
      const headingText = heading?.[2]

      if (headingMarks && headingText) {
        if (lineIndex > 0) boundaries.add(lineIndex)

        const depth = headingMarks.length
        headingPath = headingPath.slice(0, depth - 1)
        headingPath[depth - 1] = headingText.trim()
      }

      headingPathByLine.push(headingPath.slice())

      if (fenceMatch?.[1]) {
        const fenceToken = fenceMatch[1]
        const character = fenceToken[0]

        if (character === '`' || character === '~') {
          activeFence = { character, length: fenceToken.length }
        }

        relationEligibleByLine.push(false)
        continue
      }

      relationEligibleByLine.push(true)

      if (!/^\s*$/.test(line.text)) continue

      let nextContentLine = lineIndex + 1
      while (nextContentLine < lines.length && /^\s*$/.test(lines[nextContentLine]?.text ?? '')) {
        nextContentLine += 1
      }

      if (nextContentLine >= lines.length) continue

      let previousContentLine = lineIndex - 1
      while (previousContentLine >= 0 && /^\s*$/.test(lines[previousContentLine]?.text ?? '')) {
        previousContentLine -= 1
      }

      if (previousContentLine < 0) continue

      const previousText = lines[previousContentLine]?.text ?? ''
      const nextText = lines[nextContentLine]?.text ?? ''
      const continuesList =
        listItemPattern.test(previousText) && (listItemPattern.test(nextText) || /^ {4,}\S/.test(nextText))

      if (!continuesList) boundaries.add(nextContentLine)
    }

    const orderedBoundaries = [...boundaries].sort((left, right) => left - right)

    return orderedBoundaries.map((startLine, id) => {
      const nextStartLine = orderedBoundaries[id + 1] ?? lines.length
      const firstLine = lines[startLine]
      const finalLine = lines[nextStartLine - 1]

      if (!firstLine || !finalLine) throw new RangeError('Invalid Markdown block boundary')

      const startOffset = firstLine.startOffset
      const endOffset = finalLine.endOffset
      const relationText = lines
        .slice(startLine, nextStartLine)
        .map((line, lineOffset) => {
          const eligible = relationEligibleByLine[startLine + lineOffset] ?? false
          const sourceText = source.slice(line.startOffset, line.endOffset)

          return eligible ? MarkdownChunkFactory.withoutInlineCode(sourceText) : sourceText.replace(/[^\r\n]/g, ' ')
        })
        .join('')

      return {
        id,
        startOffset,
        endOffset,
        startLine,
        endLine: nextStartLine,
        text: source.slice(startOffset, endOffset),
        headingPath: headingPathByLine[startLine] ?? [],
        relationText,
      }
    })
  }

  private static splitLines(source: string): SourceLine[] {
    const lines: SourceLine[] = []
    let startOffset = 0

    while (startOffset < source.length) {
      let endOffset = startOffset
      while (endOffset < source.length && source[endOffset] !== '\n' && source[endOffset] !== '\r') {
        endOffset += 1
      }

      if (endOffset < source.length) {
        if (source[endOffset] === '\r' && source[endOffset + 1] === '\n') endOffset += 2
        else endOffset += 1
      }

      const lineEnd =
        source[endOffset - 2] === '\r' && source[endOffset - 1] === '\n'
          ? endOffset - 2
          : source[endOffset - 1] === '\r' || source[endOffset - 1] === '\n'
            ? endOffset - 1
            : endOffset

      lines.push({ text: source.slice(startOffset, lineEnd), startOffset, endOffset })
      startOffset = endOffset
    }

    return lines
  }

  private static isClosingFence(line: string, fence: Fence): boolean {
    const marker = fence.character === '`' ? '`' : '~'
    const closingPattern = new RegExp(`^ {0,3}${marker}{${fence.length},}[ \\t]*$`)

    return closingPattern.test(line)
  }

  private static withoutInlineCode(text: string): string {
    return text.replace(/(`+).*?\1/g, (code) => ' '.repeat(code.length))
  }

  private static validateChunkStarts(chunkStarts: readonly number[], blockCount: number): void {
    if (!chunkStarts.length || chunkStarts[0] !== 0) {
      throw new RangeError('Chunk starts must include the first block')
    }

    for (const [index, blockId] of chunkStarts.entries()) {
      if (!Number.isInteger(blockId) || blockId < 0 || blockId >= blockCount) {
        throw new RangeError('Chunk start is outside scanned blocks')
      }

      if (index > 0 && blockId <= (chunkStarts[index - 1] ?? -1)) {
        throw new RangeError('Chunk starts must be strictly increasing')
      }
    }
  }

  private static extractRelations(block: InternalBlock): PlannedRelation[] {
    return [
      ...[...block.relationText.matchAll(wikiLink)].flatMap((match) => MarkdownChunkFactory.toRelation(match, block)),
      ...[...block.relationText.matchAll(markdownLink)].flatMap((match) =>
        MarkdownChunkFactory.toRelation(match, block),
      ),
    ]
  }

  private static toRelation(match: RegExpMatchArray, block: InternalBlock): PlannedRelation[] {
    const targetReference = match[1]

    if (!targetReference?.trim() || /^(?:https?:|mailto:|#)/i.test(targetReference.trim())) return []

    return [
      {
        targetReference,
        targetAnchor: match[2] ?? null,
        relationType: 'references',
        evidenceBlockStart: block.startLine,
        evidenceBlockEnd: block.endLine,
        evidenceText: block.text,
      },
    ]
  }
}
