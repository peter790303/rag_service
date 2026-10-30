import { loadHostCliBridgeConfig } from '../config/host-cli-bridge.config.ts'
import { createHostCliBridgeServer } from './Chunks/Infrastructure/External/ChunkPlanning/host-cli-bridge.server.ts'

try {
  const config = loadHostCliBridgeConfig()
  const { server, close } = createHostCliBridgeServer(config)
  server.listen(config.port, config.host, () => {
    const address = server.address()

    if (address && typeof address !== 'string')
      console.info(`[host-cli] listening on ${address.address}:${address.port}`)
  })

  const shutdown = (): void => {
    void close().then(
      () => process.exit(0),
      () => process.exit(1),
    )
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
} catch (cause) {
  console.error(`[host-cli] failed to start: ${cause instanceof Error ? cause.message : 'invalid configuration'}`)
  process.exitCode = 1
}
