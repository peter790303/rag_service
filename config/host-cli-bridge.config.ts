export interface HostCliBridgeConfig {
  host: string
  port: number
  sharedSecret: string
  executable: string
  model: string
  timeoutMs: number
  maxOutputBytes: number
}

const positiveInteger = (name: string, value: string | undefined, fallback: number): number => {
  const parsed = value === undefined || value === '' ? fallback : Number(value)

  if (!Number.isSafeInteger(parsed) || parsed <= 0) throw new Error(`${name} must be a positive integer`)

  return parsed
}

export const loadHostCliBridgeConfig = (env: NodeJS.ProcessEnv = process.env): HostCliBridgeConfig => {
  const sharedSecret = env.RAG_HOST_CLI_SHARED_SECRET?.trim() ?? ''

  if (sharedSecret.length < 32) throw new Error('RAG_HOST_CLI_SHARED_SECRET must contain at least 32 characters')

  return {
    host: env.RAG_HOST_CLI_BIND_ADDRESS?.trim() || '127.0.0.1',
    port: positiveInteger('RAG_HOST_CLI_PORT', env.RAG_HOST_CLI_PORT, 30701),
    sharedSecret,
    executable: env.RAG_CHUNKING_CLI_PATH?.trim() || env.CODEX_CLI_PATH?.trim() || 'codex',
    model: env.RAG_CHUNKING_MODEL?.trim() || 'gpt-6.1-sol',
    timeoutMs: positiveInteger('RAG_EXTERNAL_REQUEST_TIMEOUT_MS', env.RAG_EXTERNAL_REQUEST_TIMEOUT_MS, 30000),
    maxOutputBytes: positiveInteger(
      'RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES',
      env.RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES,
      4194304,
    ),
  }
}
