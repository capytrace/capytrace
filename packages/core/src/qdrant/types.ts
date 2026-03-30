import type { Document } from '../types.js'

export interface QdrantConfig {
  url: string
  collectionName: string
  vectorSize: number
}

export interface ChunkPayload {
  documentId: string
  sourceType: Document['sourceType']
  sourceId: string
  content: string
  permissions: string[]
  chunkIndex: number
  createdAt: string
  title: string
  url?: string
  author?: string
}
