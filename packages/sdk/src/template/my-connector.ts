/**
 * my-connector.ts — Example connector built with the CapyTrace SDK
 *
 * Steps to build your own connector:
 *  1. Extend BaseConnector
 *  2. Set `readonly config` from the constructor argument
 *  3. Implement `sync()` — yield Documents using `this.createDocument()`
 *  4. Optionally override `connect()` / `disconnect()` for stateful sources
 */
import { BaseConnector } from '../baseConnector.js'
import type { ConnectorConfig, Document } from '../types.js'

export class MyConnector extends BaseConnector {
  readonly config: ConnectorConfig

  constructor(config: ConnectorConfig) {
    super()
    this.config = config
  }

  /**
   * Optional: called once before sync(). Use to verify credentials or open a connection.
   * The default BaseConnector implementation is a no-op.
   */
  async connect(): Promise<void> {
    this.log('Connecting to My Source...')
    // e.g. await this.client.authenticate()
  }

  /**
   * Required: yield Documents from your data source.
   * `createDocument()` auto-fills id, stableId, createdAt, updatedAt and defaults permissions to ['*'].
   */
  async *sync(): AsyncGenerator<Document> {
    this.log('Starting sync...')

    // Replace with real data-fetching logic (paginated API, filesystem walk, etc.)
    const items = [
      { id: 'item-1', title: 'First Document', body: 'Content of the first document.' },
      { id: 'item-2', title: 'Second Document', body: 'Content of the second document.' },
    ]

    for (const item of items) {
      yield this.createDocument({
        sourceType: 'filesystem', // replace with your sourceType
        sourceId: this.config.id,
        externalId: item.id,
        title: item.title,
        content: item.body,
        metadata: { originalId: item.id },
      })
    }

    this.log('Sync complete.')
  }

  /**
   * Optional: called on shutdown. Use to close connections or flush buffers.
   */
  async disconnect(): Promise<void> {
    this.log('Disconnecting.')
  }
}
