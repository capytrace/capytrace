// Represents any indexable document from any source
export interface Document {
  id: string
  sourceType: 'slack' | 'teams' | 'github' | 'drive' | 'filesystem'
  sourceId: string        // workspace/repo/drive id
  externalId: string      // original id from the source
  title: string
  content: string
  url?: string
  author?: string
  createdAt: Date
  updatedAt: Date
  permissions: string[]   // list of user/group ids with access
  metadata: Record<string, unknown>
}

// A piece of a Document after chunking
export interface Chunk {
  id: string
  documentId: string
  index: number
  content: string
  embedding?: number[]
  tokenCount: number
}

// Result returned by the search engine
export interface SearchResult {
  documentId: string
  chunkId: string
  score: number
  title: string
  snippet: string
  url?: string
  sourceType: Document['sourceType']
  highlights: string[]
}

// Base configuration that every connector will implement
export interface ConnectorConfig {
  id: string
  type: Document['sourceType']
  enabled: boolean
  syncIntervalMinutes: number
  credentials: Record<string, string>
}

// Interface that every connector must implement
export interface IConnector {
  readonly config: ConnectorConfig
  connect(): Promise<void>
  sync(): AsyncGenerator<Document>
  disconnect(): Promise<void>
}