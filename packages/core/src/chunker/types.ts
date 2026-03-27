import type { Chunk } from '../types.js'

export interface ChunkerConfig {
  chunkSize: number // number of words per chunk
  chunkOverlap: number // number of overlapping words between consecutive chunks
  minChunkSize: number // chunks with fewer words than this are discarded
}

export interface IChunker {
  readonly config: ChunkerConfig
  chunk(documentId: string, content: string): Chunk[]
}
