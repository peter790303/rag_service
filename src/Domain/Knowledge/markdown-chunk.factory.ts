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

export type PlannedRelationType = 'markdown_link' | 'wiki_link' | 'requires' | 'applies_to' | 'overrides'

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

interface MarkdownScanState {
  lines: SourceLine[]
  boundaries: Set<number>
  headingPathByLine: string[][]
  relationEligibleByLine: boolean[]
  nextContentLineByLine: number[]
  previousContentLineByLine: number[]
  headingPath: string[]
  activeFence: Fence | null
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

  static readonly relationProfile = 'markdown-links-anchored-v3-source-types'

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
    const state: MarkdownScanState = {
      lines,
      boundaries: new Set([0]),
      headingPathByLine: [],
      relationEligibleByLine: [],
      nextContentLineByLine: MarkdownChunkFactory.nextContentLines(lines),
      previousContentLineByLine: MarkdownChunkFactory.previousContentLines(lines),
      headingPath: [],
      activeFence: null,
    }

    const scannedState = lines.reduce(
      (currentState, line, lineIndex) => MarkdownChunkFactory.scanLine(line, lineIndex, currentState),
      state,
    )

    const orderedBoundaries = [...scannedState.boundaries].sort((left, right) => left - right)

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
          const eligible = scannedState.relationEligibleByLine[startLine + lineOffset] ?? false
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
        headingPath: scannedState.headingPathByLine[startLine] ?? [],
        relationText,
      }
    })
  }

  private static scanLine(line: SourceLine, lineIndex: number, state: MarkdownScanState): MarkdownScanState {
    if (state.activeFence) {
      MarkdownChunkFactory.recordFencedLine(line.text, state)

      return state
    }

    const heading = headingPattern.exec(line.text)

    if (heading?.[1] && heading[2]) MarkdownChunkFactory.recordHeading(lineIndex, heading[1], heading[2], state)

    state.headingPathByLine.push(state.headingPath.slice())

    const fenceToken = fencePattern.exec(line.text)?.[1]

    if (fenceToken) {
      MarkdownChunkFactory.openFence(fenceToken, state)
      state.relationEligibleByLine.push(false)

      return state
    }

    state.relationEligibleByLine.push(true)

    if (/^\s*$/.test(line.text)) MarkdownChunkFactory.addParagraphBoundary(lineIndex, line.text, state)

    return state
  }

  private static recordFencedLine(line: string, state: MarkdownScanState): void {
    state.headingPathByLine.push(state.headingPath.slice())
    state.relationEligibleByLine.push(false)

    if (state.activeFence && MarkdownChunkFactory.isClosingFence(line, state.activeFence)) state.activeFence = null
  }

  private static recordHeading(lineIndex: number, marks: string, text: string, state: MarkdownScanState): void {
    if (lineIndex > 0) state.boundaries.add(lineIndex)

    const depth = marks.length
    state.headingPath = state.headingPath.slice(0, depth - 1)
    state.headingPath[depth - 1] = text.trim()
  }

  private static openFence(fenceToken: string, state: MarkdownScanState): void {
    const character = fenceToken[0]

    if (character === '`' || character === '~') {
      state.activeFence = { character, length: fenceToken.length }
    }
  }

  private static addParagraphBoundary(lineIndex: number, line: string, state: MarkdownScanState): void {
    const previousContentLine = state.previousContentLineByLine[lineIndex] ?? -1
    const nextContentLine = state.nextContentLineByLine[lineIndex] ?? -1

    if (previousContentLine < 0 || nextContentLine < 0) return

    const previousText = state.lines[previousContentLine]?.text ?? ''
    const nextText = state.lines[nextContentLine]?.text ?? ''
    const continuesList =
      listItemPattern.test(previousText) && (listItemPattern.test(nextText) || /^ {4,}\S/.test(nextText))

    if (!continuesList && /^\s*$/.test(line)) state.boundaries.add(nextContentLine)
  }

  private static nextContentLines(lines: SourceLine[]): number[] {
    return lines.reduceRight<number[]>((nearestContentLine, _line, lineIndex) => {
      const nextLineIndex = lineIndex + 1
      const nextLine = lines[nextLineIndex]
      const nextContentLine =
        nextLine && !/^\s*$/.test(nextLine.text) ? nextLineIndex : (nearestContentLine[nextLineIndex] ?? -1)

      nearestContentLine[lineIndex] = nextContentLine

      return nearestContentLine
    }, [])
  }

  private static previousContentLines(lines: SourceLine[]): number[] {
    return lines.reduce<number[]>((nearestContentLine, _line, lineIndex) => {
      const previousLineIndex = lineIndex - 1
      const previousLine = lines[previousLineIndex]
      const previousContentLine =
        previousLine && !/^\s*$/.test(previousLine.text)
          ? previousLineIndex
          : (nearestContentLine[previousLineIndex] ?? -1)

      nearestContentLine[lineIndex] = previousContentLine

      return nearestContentLine
    }, [])
  }

  private static splitLines(source: string): SourceLine[] {
    return [...source.matchAll(/[^\r\n]*(?:\r\n|\r|\n|$)/g)]
      .filter((match) => match[0].length > 0)
      .map((match) => {
        const startOffset = match.index ?? 0
        const endOffset = startOffset + match[0].length
        const text = match[0].replace(/(?:\r\n|\r|\n)$/, '')

        return { text, startOffset, endOffset }
      })
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

    const validationError = chunkStarts.reduce<RangeError | null>((firstError, blockId, index) => {
      if (firstError) return firstError

      if (!Number.isInteger(blockId) || blockId < 0 || blockId >= blockCount) {
        return new RangeError('Chunk start is outside scanned blocks')
      }

      if (index > 0 && blockId <= (chunkStarts[index - 1] ?? -1)) {
        return new RangeError('Chunk starts must be strictly increasing')
      }

      return null
    }, null)

    if (validationError) throw validationError
  }

  private static extractRelations(block: InternalBlock): PlannedRelation[] {
    return [
      ...[...block.relationText.matchAll(wikiLink)].flatMap((match) =>
        MarkdownChunkFactory.toRelation(match, block, 'wiki_link'),
      ),
      ...[...block.relationText.matchAll(markdownLink)].flatMap((match) =>
        MarkdownChunkFactory.toRelation(match, block, 'markdown_link'),
      ),
    ]
  }

  private static toRelation(
    match: RegExpMatchArray,
    block: InternalBlock,
    relationType: PlannedRelationType,
  ): PlannedRelation[] {
    const targetReference = match[1]

    if (!targetReference?.trim() || /^(?:https?:|mailto:|#)/i.test(targetReference.trim())) return []

    return [
      {
        targetReference,
        targetAnchor: match[2] ?? null,
        relationType,
        evidenceBlockStart: block.startLine,
        evidenceBlockEnd: block.endLine,
        evidenceText: block.text,
      },
    ]
  }
}
