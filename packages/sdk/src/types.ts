import type { Document, Chunk, SearchResult, ConnectorConfig, IConnector } from '@capytrace/core'

// Re-export core types for SDK consumers
export type { Document, Chunk, SearchResult, ConnectorConfig, IConnector }

export interface PluginConfigField {
  type: 'string' | 'boolean' | 'number'
  required: boolean
  description: string
  default?: string | boolean | number
}

export interface PluginManifest {
  name: string        // e.g. 'notion-connector'
  version: string     // e.g. '1.0.0'
  description: string
  author: string
  sourceType: string  // e.g. 'notion'
  configSchema: Record<string, PluginConfigField>
}

export interface CapyTracePlugin {
  manifest: PluginManifest
  createConnector(config: ConnectorConfig): IConnector
}
