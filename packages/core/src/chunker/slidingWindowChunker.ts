import { randomUUID } from 'crypto'
import type { Chunk } from '../types.js'
import type { ChunkerConfig, IChunker } from './types.js'

export class SlidingWindowChunker implements IChunker {
  readonly config: ChunkerConfig

  constructor(config: ChunkerConfig) {
    if (config.chunkOverlap >= config.chunkSize) {
      throw new Error('chunkOverlap must be smaller than chunkSize')
    }
    this.config = config
  }

  chunk(documentId: string, content: string): Chunk[] {
    const words = content.trim().split(/\s+/).filter((w) => w.length > 0)

    if (words.length === 0) {
      return []
    }

    const { chunkSize, chunkOverlap, minChunkSize } = this.config
    const step = chunkSize - chunkOverlap
    const chunks: Chunk[] = []
    let index = 0

    for (let start = 0; start < words.length; start += step) {
      const slice = words.slice(start, start + chunkSize)

      if (slice.length < minChunkSize) {
        break
      }

      chunks.push({
        id: randomUUID(),
        documentId,
        index: index++,
        content: slice.join(' '),
        tokenCount: slice.length,
      })
    }

    return chunks
  }
}
