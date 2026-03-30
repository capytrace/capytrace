import type { Chunk } from '../types.js'
import type { EmbedderConfig, IEmbedder } from './types.js'

const DEFAULTS: EmbedderConfig = {
  ollamaUrl: 'http://localhost:11434',
  model: 'nomic-embed-text',
  batchSize: 32,
  timeoutMs: 30000,
  retryDelayMs: 1000,
}

// 1 initial attempt + 3 retries, with exponential delays: 1s, 2s, 4s
const MAX_ATTEMPTS = 4

export class OllamaEmbedder implements IEmbedder {
  private readonly config: EmbedderConfig

  constructor(config: Partial<EmbedderConfig> = {}) {
    this.config = { ...DEFAULTS, ...config }
  }

  async embedText(text: string): Promise<number[]> {
    const embeddings = await this.embedBatchWithRetry([text])
    const result = embeddings[0]
    if (result === undefined) throw new Error('Ollama returned no embedding for the query')
    return result
  }

  async embedChunks(chunks: Chunk[]): Promise<Chunk[]> {
    if (chunks.length === 0) return []

    const { batchSize } = this.config
    const result: Chunk[] = []

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, i + batchSize)
      const embeddings = await this.embedBatchWithRetry(batch.map((c) => c.content))

      for (let j = 0; j < batch.length; j++) {
        result.push({ ...batch[j]!, embedding: embeddings[j]! })
      }
    }

    return result
  }

  private async embedBatchWithRetry(texts: string[]): Promise<number[][]> {
    let lastError: unknown

    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (attempt > 0) {
        await sleep(this.config.retryDelayMs * Math.pow(2, attempt - 1))
      }

      try {
        return await this.callOllamaApi(texts)
      } catch (err) {
        lastError = err
      }
    }

    throw lastError
  }

  private async callOllamaApi(texts: string[]): Promise<number[][]> {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs)

    try {
      const response = await fetch(`${this.config.ollamaUrl}/api/embed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, input: texts }),
        signal: controller.signal,
      })

      if (response.status === 404) {
        return await this.callOllamaApiLegacy(texts, controller.signal)
      }

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { embeddings: number[][] }
      return data.embeddings
    } finally {
      clearTimeout(timer)
    }
  }

  private async callOllamaApiLegacy(texts: string[], signal: AbortSignal): Promise<number[][]> {
    const results: number[][] = []
    for (const text of texts) {
      const response = await fetch(`${this.config.ollamaUrl}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: this.config.model, prompt: text }),
        signal,
      })

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`)
      }

      const data = (await response.json()) as { embedding: number[] }
      results.push(data.embedding)
    }
    return results
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
