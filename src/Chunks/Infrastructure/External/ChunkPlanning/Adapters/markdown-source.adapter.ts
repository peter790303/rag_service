import type { MarkdownSourceBlock } from '../../../../../DocumentIndexes/Application/DataTransferObjects/markdown-source-block.dto.ts'
import { InvalidMarkdownSourceBoundaryException } from '../Exceptions/invalid-markdown-source-boundary.exception.ts'

interface SourceLine {
  text: string
  startOffset: number
  endOffset: number
}

interface Fence {
  character: '`' | '~'
  length: number
}

interface HeadingAncestor {
  depth: number
  text: string
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
  headingAncestors: HeadingAncestor[]
  activeFence: Fence | null
}

export interface MarkdownRelationSourceBlock {
  sourceBlock: MarkdownSourceBlock
  relationText: string
}

export interface MarkdownSourceScan {
  blocks: MarkdownSourceBlock[]
  relationBlocks: MarkdownRelationSourceBlock[]
}

const headingPattern = /^ {0,3}(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/
const fencePattern = /^ {0,3}(`{3,}|~{3,})/
const listItemPattern = /^ {0,3}(?:[-+*]|\d+[.)])[ \t]+/

/** Parses legal Markdown block positions while retaining the exact source. */
export class MarkdownSourceAdapter {
  static scan(source: string): MarkdownSourceScan {
    const parsedBlocks = MarkdownSourceAdapter.scanInternal(source)
    const blocks = parsedBlocks.map((block) => ({
      id: block.id,
      startOffset: block.startOffset,
      endOffset: block.endOffset,
      startLine: block.startLine,
      endLine: block.endLine,
      text: block.text,
      headingPath: block.headingPath,
    }))

    return {
      blocks,
      relationBlocks: parsedBlocks.map((block, index) => ({
        sourceBlock: blocks[index] ?? block,
        relationText: block.relationText,
      })),
    }
  }

  private static scanInternal(source: string): InternalBlock[] {
    if (!source.length) return []

    const lines = MarkdownSourceAdapter.splitLines(source)
    const state: MarkdownScanState = {
      lines,
      boundaries: new Set([0]),
      headingPathByLine: [],
      relationEligibleByLine: [],
      nextContentLineByLine: MarkdownSourceAdapter.nextContentLines(lines),
      previousContentLineByLine: MarkdownSourceAdapter.previousContentLines(lines),
      headingAncestors: [],
      activeFence: null,
    }

    const scannedState = lines.reduce(
      (currentState, line, lineIndex) => MarkdownSourceAdapter.scanLine(line, lineIndex, currentState),
      state,
    )

    const orderedBoundaries = [...scannedState.boundaries].sort((left, right) => left - right)

    return orderedBoundaries.map((startLine, id) => {
      const nextStartLine = orderedBoundaries[id + 1] ?? lines.length
      const firstLine = lines[startLine]
      const finalLine = lines[nextStartLine - 1]

      if (!firstLine || !finalLine) throw new InvalidMarkdownSourceBoundaryException()

      const startOffset = firstLine.startOffset
      const endOffset = finalLine.endOffset
      const relationText = lines
        .slice(startLine, nextStartLine)
        .map((line, lineOffset) => {
          const eligible = scannedState.relationEligibleByLine[startLine + lineOffset] ?? false
          const sourceText = source.slice(line.startOffset, line.endOffset)

          return eligible ? MarkdownSourceAdapter.withoutInlineCode(sourceText) : sourceText.replace(/[^\r\n]/g, ' ')
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
      MarkdownSourceAdapter.recordFencedLine(line.text, state)

      return state
    }

    const heading = headingPattern.exec(line.text)

    if (heading?.[1] && heading[2]) MarkdownSourceAdapter.recordHeading(lineIndex, heading[1], heading[2], state)

    state.headingPathByLine.push(state.headingAncestors.map((heading) => heading.text))

    const fenceToken = fencePattern.exec(line.text)?.[1]

    if (fenceToken) {
      MarkdownSourceAdapter.openFence(fenceToken, state)
      state.relationEligibleByLine.push(false)

      return state
    }

    state.relationEligibleByLine.push(true)

    if (/^\s*$/.test(line.text)) MarkdownSourceAdapter.addParagraphBoundary(lineIndex, line.text, state)

    return state
  }

  private static recordFencedLine(line: string, state: MarkdownScanState): void {
    state.headingPathByLine.push(state.headingAncestors.map((heading) => heading.text))
    state.relationEligibleByLine.push(false)

    if (state.activeFence && MarkdownSourceAdapter.isClosingFence(line, state.activeFence)) state.activeFence = null
  }

  private static recordHeading(lineIndex: number, marks: string, text: string, state: MarkdownScanState): void {
    if (lineIndex > 0) state.boundaries.add(lineIndex)

    const depth = marks.length
    state.headingAncestors = state.headingAncestors.filter((heading) => heading.depth < depth)
    state.headingAncestors.push({ depth, text: text.trim() })
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
}
