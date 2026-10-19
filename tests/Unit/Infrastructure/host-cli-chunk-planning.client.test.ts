import assert from 'node:assert/strict'
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'

import { ChunkPlanningUnavailableException } from '../../../src/Application/Chunks/Exceptions/chunk-planning-unavailable.exception.ts'
import { HostCliChunkPlanningClient } from '../../../src/Infrastructure/External/ChunkPlanning/host-cli-chunk-planning.client.ts'

const source = '# Title\r\n\r\nFirst paragraph.\r\n\r\nSecond paragraph.\r\n'
const createFakeCli = async (body: string): Promise<{ directory: string; executable: string }> => {
  const directory = await mkdtemp(join(tmpdir(), 'rag-fake-cli-'))
  const executable = join(directory, 'codex.mjs')
  await writeFile(
    executable,
    `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nconst args = process.argv.slice(2);\nconst resultPath = args[args.indexOf('--output-last-message') + 1];\nlet prompt = '';\nprocess.stdin.setEncoding('utf8');\nprocess.stdin.on('data', chunk => { prompt += chunk });\nprocess.stdin.on('end', () => { ${body} });\n`,
  )
  await chmod(executable, 0o700)

  return { directory, executable }
}
const clientFor = (
  executable: string,
  overrides: { externalRequestTimeoutMs?: number; chunkingCliMaxOutputBytes?: number } = {},
): HostCliChunkPlanningClient =>
  new HostCliChunkPlanningClient({
    chunkingCliPath: executable,
    chunkingModel: 'gpt-6.1-sol',
    externalRequestTimeoutMs: 3000,
    chunkingCliMaxOutputBytes: 65536,
    ...overrides,
  })

test('host CLI sends source only on stdin, isolates cwd, and copies exact source spans', async () => {
  const fake = await createFakeCli('')
  const capturePath = join(fake.directory, 'capture.json')
  await writeFile(
    fake.executable,
    `#!${process.execPath}\nimport { writeFileSync } from 'node:fs';\nconst args=process.argv.slice(2);let prompt='';process.stdin.on('data', chunk=>{prompt+=chunk});process.stdin.on('end',()=>{writeFileSync(${JSON.stringify(capturePath)},JSON.stringify({args,prompt,cwd:process.cwd()}));writeFileSync(args[args.indexOf('--output-last-message')+1],JSON.stringify({chunkStarts:['block-0']}));console.log(JSON.stringify({type:'turn.completed'}))});`,
  )
  try {
    const result = await clientFor(fake.executable).plan(source)
    assert.equal(result.chunks.map((chunk) => chunk.content).join(''), source)
    const capture = JSON.parse(await readFile(capturePath, 'utf8')) as { args: string[]; prompt: string; cwd: string }
    assert.equal(capture.args.at(-1), '-')
    assert.equal(capture.args[capture.args.indexOf('--sandbox') + 1], 'read-only')
    assert.equal(capture.args[capture.args.indexOf('--model') + 1], 'gpt-6.1-sol')
    assert.ok(capture.args.includes('--ephemeral'))
    assert.ok(capture.args.includes('--ignore-user-config'))
    assert.ok(capture.prompt.includes('First paragraph.'))
    assert.ok(!capture.args.join(' ').includes('First paragraph.'))
    assert.notEqual(capture.cwd, process.cwd())
    await assert.rejects(readFile(join(capture.cwd, 'last-message.json')), { code: 'ENOENT' })
  } finally {
    await rm(fake.directory, { recursive: true, force: true })
  }
})

const failures = [
  { name: 'unsuccessful exit', body: 'process.exitCode = 2', code: 'HOST_CLI_EXECUTION_FAILED' },
  {
    name: 'missing completion event',
    code: 'HOST_CLI_TURN_INCOMPLETE',
    body: `writeFileSync(resultPath, '{"chunkStarts":["block-0"]}'); console.log('{"type":"item.completed"}')`,
  },
  { name: 'missing result file', body: `console.log('{"type":"turn.completed"}')` },
  { name: 'invalid JSON', body: `writeFileSync(resultPath, 'bad'); console.log('{"type":"turn.completed"}')` },
  {
    name: 'unknown boundaries',
    body: `writeFileSync(resultPath, '{"chunkStarts":["block-99"]}'); console.log('{"type":"turn.completed"}')`,
  },
  {
    name: 'oversized stdout',
    code: 'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
    body: `process.stdout.write('x'.repeat(10000))`,
    max: 1024,
  },
  {
    name: 'oversized stderr',
    code: 'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
    body: `process.stderr.write('x'.repeat(10000))`,
    max: 1024,
  },
  {
    name: 'oversized result file',
    code: 'HOST_CLI_OUTPUT_LIMIT_EXCEEDED',
    body: `writeFileSync(resultPath, 'x'.repeat(10000)); console.log('{"type":"turn.completed"}')`,
    max: 1024,
  },
  { name: 'timeout', code: 'HOST_CLI_REQUEST_TIMED_OUT', body: `setInterval(() => {}, 1000)`, timeout: 150 },
]
failures.map((scenario) =>
  test(`host CLI rejects ${scenario.name}`, async () => {
    const fake = await createFakeCli(scenario.body)
    try {
      await assert.rejects(
        clientFor(fake.executable, {
          externalRequestTimeoutMs: scenario.timeout ?? 3000,
          chunkingCliMaxOutputBytes: scenario.max ?? 65536,
        }).plan(source),
        (error: unknown) => {
          assert.ok(error instanceof ChunkPlanningUnavailableException)

          if (scenario.code) assert.equal((error.cause as { code: string }).code, scenario.code)

          return true
        },
      )
    } finally {
      await rm(fake.directory, { recursive: true, force: true })
    }
  }),
)

test('host CLI handles abort and avoids spawning for empty input', async () => {
  const fake = await createFakeCli('setInterval(() => {}, 1000)')
  try {
    const controller = new AbortController()
    const pending = clientFor(fake.executable).plan(source, controller.signal)
    controller.abort()
    await assert.rejects(pending, (error: unknown) => {
      assert.ok(error instanceof ChunkPlanningUnavailableException)
      assert.equal((error.cause as { code: string }).code, 'HOST_CLI_REQUEST_ABORTED')

      return true
    })
    assert.deepEqual(await clientFor('/missing-cli').plan(''), { chunks: [], relations: [] })
    await assert.rejects(clientFor('/missing-cli').plan(source), ChunkPlanningUnavailableException)
  } finally {
    await rm(fake.directory, { recursive: true, force: true })
  }
})
