import { randomBytes } from 'node:crypto'
import process from 'node:process'

import { NestFactory } from '@nestjs/core'
import 'reflect-metadata'

import { RetryFailedJobsCommand } from '../dist/src/Interfaces/Console/Commands/retry-failed-jobs-command.js'
import { RetryFailedJobsModule } from '../dist/src/Interfaces/Console/Commands/retry-failed-jobs.module.js'

const parseOptions = (args) => {
  if (args.length % 2 !== 0) throw new Error(`Missing value for ${args.at(-1)}`)

  const options = args.reduce((parsed, option, index) => {
    if (index % 2 !== 0) return parsed

    if (option !== '--id' && option !== '--project') throw new Error(`Unknown option: ${option}`)

    if (parsed[option] !== undefined) throw new Error(`Duplicate option: ${option}`)

    const value = args[index + 1]

    if (!value || value.startsWith('--')) throw new Error(`${option} requires a value`)

    parsed[option] = value

    return parsed
  }, {})

  return { failedJobId: options['--id'], projectId: options['--project'] }
}

const run = async () => {
  const options = parseOptions(process.argv.slice(2))
  const originalAuthSecret = process.env.RAG_SERVICE_AUTH_SECRET
  process.env.RAG_SERVICE_AUTH_SECRET ||= randomBytes(32).toString('hex')
  let app

  try {
    app = await NestFactory.createApplicationContext(RetryFailedJobsModule, { logger: false })
    const result = await app.get(RetryFailedJobsCommand).execute(options)

    process.stdout.write(
      `Queued ${result.queued.length}; skipped ${result.skipped.length}; failures ${result.failures.length}.\n`,
    )
    const outcomes = [
      ...result.queued.map((item) => `queued ${item.failedJobId} as ${item.jobId}`),
      ...result.skipped.map((item) => `skipped ${item.failedJobId}: ${item.reason}`),
    ]

    if (outcomes.length > 0) process.stdout.write(`${outcomes.join('\n')}\n`)

    const failures = result.failures.map((item) => `failed ${item.failedJobId}: ${item.reason}`)

    if (failures.length > 0) process.stderr.write(`${failures.join('\n')}\n`)

    if (result.failures.length > 0) process.exitCode = 1
  } finally {
    if (app) await app.close()

    if (originalAuthSecret === undefined) delete process.env.RAG_SERVICE_AUTH_SECRET
    else process.env.RAG_SERVICE_AUTH_SECRET = originalAuthSecret
  }
}

run().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
