import Fastify from 'fastify'
import cors from '@fastify/cors'
import helmet from '@fastify/helmet'
import { OllamaEmbedder, QdrantStore, indexQueue } from '@capytrace/core'
import type { SearchResult } from '@capytrace/core'
import type { Orchestrator } from './orchestrator.js'

// ---------------------------------------------------------------------------
// Request / response shapes
// ---------------------------------------------------------------------------

type SearchFilters = {
  sourceType?: string
  author?: string
}

type SearchBody = {
  query: string
  limit?: number
  sources?: string[]
  filters?: SearchFilters
}

type SearchResponse = {
  results: SearchResult[]
  took: number
  total: number
}

type HealthResponse = {
  status: 'ok' | 'degraded'
  services: { redis: boolean; qdrant: boolean; ollama: boolean }
}

// ---------------------------------------------------------------------------
// Health helpers
// ---------------------------------------------------------------------------

async function checkRedis(): Promise<boolean> {
  try {
    await indexQueue.isPaused()
    return true
  } catch {
    return false
  }
}

async function checkQdrant(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/healthz`, { signal: AbortSignal.timeout(3000) })
    return resp.ok
  } catch {
    return false
  }
}

async function checkOllama(url: string): Promise<boolean> {
  try {
    const resp = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) })
    return resp.ok
  } catch {
    return false
  }
}

// ---------------------------------------------------------------------------
// Server factory
// ---------------------------------------------------------------------------

export async function buildServer(orchestrator: Orchestrator) {
  const app = Fastify({ logger: false })

  await app.register(cors)
  await app.register(helmet, { contentSecurityPolicy: false })

  const qdrantUrl = process.env['QDRANT_URL'] ?? 'http://localhost:6333'
  const ollamaUrl = process.env['OLLAMA_URL'] ?? 'http://localhost:11434'

  const embedder = new OllamaEmbedder({ ollamaUrl })
  const store = new QdrantStore({ url: qdrantUrl })

  // ── POST /search ──────────────────────────────────────────────────────────
  app.post<{ Body: SearchBody; Reply: SearchResponse }>(
    '/search',
    async (request, reply) => {
      const start = Date.now()
      const { query, limit = 10, filters } = request.body

      const vector = await embedder.embedText(query)

      const searchFilter: { sourceType?: string; author?: string } = {}
      if (filters?.sourceType !== undefined) searchFilter.sourceType = filters.sourceType
      if (filters?.author !== undefined) searchFilter.author = filters.author
      const hasFilter = Object.keys(searchFilter).length > 0

      const searchOptions: { limit: number; filter?: { sourceType?: string; author?: string } } = { limit }
      if (hasFilter) searchOptions.filter = searchFilter

      const results = await store.search(vector, searchOptions)

      // Deduplicate: keep only the highest-scoring chunk per document
      const seen = new Map<string, SearchResult>()
      for (const result of results) {
        const existing = seen.get(result.documentId)
        if (existing === undefined || result.score > existing.score) {
          seen.set(result.documentId, result)
        }
      }
      const deduplicated = Array.from(seen.values())
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)

      return reply.send({ results: deduplicated, took: Date.now() - start, total: deduplicated.length })
    },
  )

  // ── GET /health ───────────────────────────────────────────────────────────
  app.get<{ Reply: HealthResponse }>('/health', async (_request, reply) => {
    const [redis, qdrant, ollama] = await Promise.all([
      checkRedis(),
      checkQdrant(qdrantUrl),
      checkOllama(ollamaUrl),
    ])

    const allOk = redis && qdrant && ollama
    return reply
      .code(allOk ? 200 : 503)
      .send({ status: allOk ? 'ok' : 'degraded', services: { redis, qdrant, ollama } })
  })

  // ── GET /sources ──────────────────────────────────────────────────────────
  app.get('/sources', async (_request, reply) => {
    return reply.send(orchestrator.getStatus())
  })

  // ── POST /sync ────────────────────────────────────────────────────────────
  app.post('/sync', async (_request, reply) => {
    const result = await orchestrator.triggerSync()
    return reply.send(result)
  })

  return app
}
