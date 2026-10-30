import { spawn } from 'node:child_process'
import { constants } from 'node:fs'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { HostCliExecutionFailedException } from './Exceptions/host-cli-execution-failed.exception.ts'
import { HostCliOutputLimitExceededException } from './Exceptions/host-cli-output-limit-exceeded.exception.ts'
import { HostCliRequestAbortedException } from './Exceptions/host-cli-request-aborted.exception.ts'
import { HostCliRequestTimedOutException } from './Exceptions/host-cli-request-timed-out.exception.ts'
import { HostCliTurnIncompleteException } from './Exceptions/host-cli-turn-incomplete.exception.ts'

interface HostCliExecutionOptions {
  executable: string
  model: string
  prompt: string
  timeoutMs: number
  maxOutputBytes: number
  signal?: AbortSignal
}

const requireCompletedTurn = (output: string): void => {
  const events = output.trim().split('\n').filter(Boolean)
  const finalEvent: unknown = JSON.parse(events.at(-1) ?? '')

  if (
    typeof finalEvent !== 'object' ||
    finalEvent === null ||
    !('type' in finalEvent) ||
    finalEvent.type !== 'turn.completed'
  )
    throw new HostCliTurnIncompleteException()
}

const readBoundedResult = async (path: string, maxBytes: number): Promise<string> => {
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)

  try {
    const metadata = await handle.stat()

    if (!metadata.isFile() || metadata.size > maxBytes) throw new HostCliOutputLimitExceededException()

    const buffer = Buffer.alloc(maxBytes + 1)
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0)

    if (bytesRead > maxBytes) throw new HostCliOutputLimitExceededException()

    return buffer.subarray(0, bytesRead).toString('utf8')
  } finally {
    await handle.close()
  }
}

const execute = (options: HostCliExecutionOptions, cwd: string, resultPath: string): Promise<string> =>
  new Promise((resolve, reject) => {
    const child = spawn(
      options.executable,
      [
        'exec',
        '--ignore-user-config',
        '--ephemeral',
        '--json',
        '--skip-git-repo-check',
        '--sandbox',
        'read-only',
        '--output-last-message',
        resultPath,
        '-C',
        cwd,
        '--model',
        options.model,
        '-c',
        'allow_login_shell=false',
        '--',
        '-',
      ],
      { cwd, detached: process.platform !== 'win32', stdio: ['pipe', 'pipe', 'pipe'] },
    )
    const output: Buffer[] = []
    let outputBytes = 0
    let failure: Error | undefined
    let killTimer: NodeJS.Timeout | undefined
    const kill = (signal: NodeJS.Signals): void => {
      try {
        if (process.platform !== 'win32' && child.pid) process.kill(-child.pid, signal)
        else child.kill(signal)
      } catch {
        // The child may have exited between cancellation and signal delivery.
      }
    }
    const stop = (reason: Error): void => {
      if (failure) return

      failure = reason
      kill('SIGTERM')
      killTimer = setTimeout(() => kill('SIGKILL'), 250)
    }
    const abort = (): void => stop(new HostCliRequestAbortedException())
    const timeout = setTimeout(() => stop(new HostCliRequestTimedOutException()), options.timeoutMs)
    const collect = (chunk: Buffer, stdout: boolean): void => {
      outputBytes += chunk.length

      if (outputBytes > options.maxOutputBytes) {
        stop(new HostCliOutputLimitExceededException())

        return
      }

      if (stdout) output.push(chunk)
    }
    child.stdout.on('data', (chunk: Buffer) => collect(chunk, true))
    child.stderr.on('data', (chunk: Buffer) => collect(chunk, false))
    child.stdin.on('error', (cause: Error) => stop(cause))
    child.on('error', (cause: Error) => {
      failure ??= cause
    })
    child.on('close', (code) => {
      clearTimeout(timeout)
      clearTimeout(killTimer)
      options.signal?.removeEventListener('abort', abort)

      if (failure) reject(failure)
      else if (code !== 0) reject(new HostCliExecutionFailedException())
      else resolve(Buffer.concat(output).toString('utf8'))
    })
    options.signal?.addEventListener('abort', abort, { once: true })

    if (options.signal?.aborted) abort()
    else child.stdin.end(options.prompt)
  })

/** Runs a bounded, isolated host process; no source content is exposed in argv. */
export const executeHostCliChunkPlanning = async (options: HostCliExecutionOptions): Promise<string> => {
  const cwd = await mkdtemp(join(tmpdir(), 'rag-chunk-planning-'))
  const resultPath = join(cwd, 'last-message.json')

  try {
    const output = await execute(options, cwd, resultPath)
    requireCompletedTurn(output)

    return await readBoundedResult(resultPath, options.maxOutputBytes)
  } finally {
    await rm(cwd, { recursive: true, force: true })
  }
}
