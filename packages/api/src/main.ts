import '@dotenvx/dotenvx/config'

import { indexWorker, QdrantStore } from '@ferretsearch/core'
import { Orchestrator } from './orchestrator.js'
import { buildServer } from './server.js'

const log = (msg: string) => console.log(`[FerretSearch] ${msg}`)

async function checkServices(): Promise<{ redis: boolean; qdrant: boolean; ollama: boolean }> {
  const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
  const ollamaUrl = process.env['OLLAMA_URL'] ?? 'http://localhost:11434'

  const [redis, qdrant, ollama] = await Promise.all([
    (async () => {
      try {
        await indexWorker.isPaused()
        return true
      } catch {
        return false
      }
    })(),
    (async () => {
      try {
        const r = await fetch(`${qdrantUrl}/health`, { signal: AbortSignal.timeout(3000) })
        return r.ok
      } catch {
        return false
      }
    })(),
    (async () => {
      try {
        const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(3000) })
        return r.ok
      } catch {
        return false
      }
    })(),
  ])

  return { redis, qdrant, ollama }
}

async function main() {
  const PORT = Number(process.env['API_PORT'] ?? 3000)
  const VERSION = '0.1.0'
  const CONCURRENCY = Number(process.env['WORKER_CONCURRENCY'] ?? 5)

  log(`v${VERSION} starting...`)

  // Check service health at startup
  const services = await checkServices()
  const svcLine = [
    `Redis ${services.redis ? '✓' : '✗'}`,
    `Qdrant ${services.qdrant ? '✓' : '✗'}`,
    `Ollama ${services.ollama ? '✓' : '✗'}`,
  ].join(' | ')
  log(`Services: ${svcLine}`)

  // Ensure Qdrant collection exists
  if (services.qdrant) {
    const store = new QdrantStore({ url: process.env['QDRANT_URL'] ?? 'http://localhost:6333' })
    await store.createCollectionIfNotExists()
  }

  // Start orchestrator
  const orchestrator = new Orchestrator()
  await orchestrator.start()

  const activeConnectors = orchestrator.getStatus().map((s) => s.id)
  log(
    `Connectors: ${activeConnectors.length > 0 ? activeConnectors.map((id) => `${id} ✓`).join(', ') : 'none'}`,
  )
  log(`Worker started with concurrency ${CONCURRENCY}`)

  // Build and start HTTP server
  const server = await buildServer(orchestrator)
  await server.listen({ port: PORT, host: '0.0.0.0' })
  log(`API listening on http://localhost:${PORT}`)

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    log(`Received ${signal}, shutting down...`)
    await server.close()
    await orchestrator.stop()
    await indexWorker.close()
    log('Shutdown complete')
    process.exit(0)
  }

  process.on('SIGTERM', () => void shutdown('SIGTERM'))
  process.on('SIGINT', () => void shutdown('SIGINT'))
}

main().catch((err) => {
  console.error('[FerretSearch] Fatal error:', err)
  process.exit(1)
})
