import { QdrantClient } from '@qdrant/js-client-rest'
import type { Chunk, Document, SearchResult } from '../types.js'
import type { ChunkPayload, QdrantConfig } from './types.js'

const DEFAULTS: QdrantConfig = {
  url: 'http://localhost:6333',
  collectionName: 'ferretsearch',
  vectorSize: 768,
}

const UPSERT_BATCH_SIZE = 100

export interface SearchOptions {
  limit?: number
  filter?: {
    sourceType?: string
    author?: string
  }
}

export class QdrantStore {
  private readonly client: QdrantClient
  private readonly config: QdrantConfig

  constructor(config: Partial<QdrantConfig> = {}) {
    this.config = { ...DEFAULTS, ...config }
    this.client = new QdrantClient({ url: this.config.url })
  }

  async createCollectionIfNotExists(): Promise<void> {
    const { exists } = await this.client.collectionExists(this.config.collectionName)
    if (exists) return

    await this.client.createCollection(this.config.collectionName, {
      vectors: {
        dense: { size: this.config.vectorSize, distance: 'Cosine' },
      },
      sparse_vectors: {
        sparse: {},
      },
    })
  }

  async upsertChunks(chunks: Chunk[], document: Document): Promise<void> {
    if (chunks.length === 0) return

    for (const chunk of chunks) {
      if (!chunk.embedding) {
        throw new Error(`Chunk ${chunk.id} is missing embedding — run embedder before upserting`)
      }
    }

    for (let i = 0; i < chunks.length; i += UPSERT_BATCH_SIZE) {
      const batch = chunks.slice(i, i + UPSERT_BATCH_SIZE)

      await this.client.upsert(this.config.collectionName, {
        wait: true,
        points: batch.map((chunk) => {
          const payload: ChunkPayload = {
            documentId: chunk.documentId,
            sourceType: document.sourceType,
            sourceId: document.sourceId,
            content: chunk.content,
            permissions: document.permissions,
            chunkIndex: chunk.index,
            createdAt: document.createdAt.toISOString(),
            title: document.title,
          }
          if (document.url !== undefined) payload.url = document.url
          if (document.author !== undefined) payload.author = document.author
          return {
            id: chunk.id,
            vector: { dense: chunk.embedding! },
            payload: payload as unknown as Record<string, unknown>,
          }
        }),
      })
    }
  }

  async search(vector: number[], options: SearchOptions = {}): Promise<SearchResult[]> {
    const mustClauses: Array<{ key: string; match: { value: unknown } }> = []

    if (options.filter?.sourceType !== undefined) {
      mustClauses.push({ key: 'sourceType', match: { value: options.filter.sourceType } })
    }
    if (options.filter?.author !== undefined) {
      mustClauses.push({ key: 'author', match: { value: options.filter.author } })
    }

    const searchParams: Record<string, unknown> = {
      vector: { name: 'dense', vector },
      limit: options.limit ?? 10,
      with_payload: true,
    }
    if (mustClauses.length > 0) {
      searchParams['filter'] = { must: mustClauses }
    }

    const points = await (
      this.client as unknown as {
        search(
          name: string,
          params: Record<string, unknown>,
        ): Promise<
          Array<{
            id: string | number
            score: number
            payload?: Record<string, unknown> | null
          }>
        >
      }
    ).search(this.config.collectionName, searchParams)

    return points.map((point) => {
      const p = (point.payload ?? {}) as Partial<ChunkPayload>
      const sourceType = (p.sourceType ?? 'slack') as Document['sourceType']

      const result: SearchResult = {
        documentId: p.documentId ?? '',
        chunkId: String(point.id),
        score: point.score,
        title: p.title ?? '',
        snippet: p.content ?? '',
        sourceType,
        highlights: [],
      }
      if (p.url !== undefined) result.url = p.url
      return result
    })
  }

  async deleteDocument(documentId: string): Promise<void> {
    await this.client.delete(this.config.collectionName, {
      wait: true,
      filter: {
        must: [{ key: 'documentId', match: { value: documentId } }],
      },
    })
  }
}
