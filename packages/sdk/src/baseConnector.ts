import { randomUUID } from 'node:crypto'
import type { Document, ConnectorConfig, IConnector } from './types.js'

type CreateDocumentParams = {
  sourceType: Document['sourceType']
  sourceId: string
  externalId: string
  title: string
  content: string
  metadata: Record<string, unknown>
  url?: string
  author?: string
  permissions?: string[]
}

export abstract class BaseConnector implements IConnector {
  abstract readonly config: ConnectorConfig

  // Default no-op — override to establish a connection
  async connect(): Promise<void> {}

  abstract sync(): AsyncGenerator<Document>

  // Default no-op — override to tear down a connection
  async disconnect(): Promise<void> {}

  /**
   * Build a Document with auto-filled id, stableId, createdAt, updatedAt.
   * permissions defaults to ['*'] if not provided.
   */
  protected createDocument(params: CreateDocumentParams): Document {
    const doc: Document = {
      id: randomUUID(),
      stableId: `${params.sourceType}:${params.sourceId}:${params.externalId}`,
      sourceType: params.sourceType,
      sourceId: params.sourceId,
      externalId: params.externalId,
      title: params.title,
      content: params.content,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: params.permissions ?? ['*'],
      metadata: params.metadata,
    }
    if (params.url !== undefined) doc.url = params.url
    if (params.author !== undefined) doc.author = params.author
    return doc
  }

  /** Log a message prefixed with [CapyTrace:<connectorId>] */
  protected log(message: string): void {
    console.log(`[CapyTrace:${this.config.id}] ${message}`)
  }
}
