import { describe, it, expect } from 'vitest'
import { BaseConnector } from './baseConnector.js'
import type { ConnectorConfig, Document } from './types.js'

// ---------------------------------------------------------------------------
// Concrete subclass for testing
// ---------------------------------------------------------------------------
const testConfig: ConnectorConfig = {
  id: 'test-connector',
  type: 'filesystem',
  enabled: true,
  syncIntervalMinutes: 60,
  credentials: {},
}

class TestConnector extends BaseConnector {
  readonly config = testConfig

  async *sync(): AsyncGenerator<Document> {
    yield this.createDocument({
      sourceType: 'filesystem',
      sourceId: 'src-1',
      externalId: 'ext-1',
      title: 'Test Doc',
      content: 'hello world',
      metadata: {},
    })
  }

  // Expose protected createDocument for unit testing
  public expose(...args: Parameters<BaseConnector['createDocument']>) {
    return this.createDocument(...args)
  }
}

// ---------------------------------------------------------------------------
// createDocument()
// ---------------------------------------------------------------------------
describe('BaseConnector.createDocument()', () => {
  const connector = new TestConnector()

  it('auto-fills id as a UUID', () => {
    const doc = connector.expose({
      sourceType: 'filesystem',
      sourceId: 'src-1',
      externalId: 'ext-1',
      title: 'Doc',
      content: 'body',
      metadata: {},
    })
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/)
  })

  it('generates stableId as sourceType:sourceId:externalId', () => {
    const doc = connector.expose({
      sourceType: 'github',
      sourceId: 'owner/repo',
      externalId: 'readme',
      title: 'README',
      content: '# Hello',
      metadata: {},
    })
    expect(doc.stableId).toBe('github:owner/repo:readme')
  })

  it('uses permissions ["*"] by default', () => {
    const doc = connector.expose({
      sourceType: 'filesystem',
      sourceId: 'src',
      externalId: 'ext',
      title: 'T',
      content: 'C',
      metadata: {},
    })
    expect(doc.permissions).toEqual(['*'])
  })

  it('uses provided permissions when supplied', () => {
    const doc = connector.expose({
      sourceType: 'filesystem',
      sourceId: 'src',
      externalId: 'ext',
      title: 'T',
      content: 'C',
      metadata: {},
      permissions: ['user-1', 'user-2'],
    })
    expect(doc.permissions).toEqual(['user-1', 'user-2'])
  })

  it('auto-fills createdAt and updatedAt as Date instances', () => {
    const doc = connector.expose({
      sourceType: 'filesystem',
      sourceId: 'src',
      externalId: 'ext',
      title: 'T',
      content: 'C',
      metadata: {},
    })
    expect(doc.createdAt).toBeInstanceOf(Date)
    expect(doc.updatedAt).toBeInstanceOf(Date)
  })

  it('each call produces a different id', () => {
    const doc1 = connector.expose({ sourceType: 'filesystem', sourceId: 's', externalId: 'e', title: 'T', content: 'C', metadata: {} })
    const doc2 = connector.expose({ sourceType: 'filesystem', sourceId: 's', externalId: 'e', title: 'T', content: 'C', metadata: {} })
    expect(doc1.id).not.toBe(doc2.id)
  })
})

// ---------------------------------------------------------------------------
// connect() and disconnect()
// ---------------------------------------------------------------------------
describe('BaseConnector default connect() and disconnect()', () => {
  it('connect() is a no-op and resolves without throwing', async () => {
    const connector = new TestConnector()
    await expect(connector.connect()).resolves.toBeUndefined()
  })

  it('disconnect() is a no-op and resolves without throwing', async () => {
    const connector = new TestConnector()
    await expect(connector.disconnect()).resolves.toBeUndefined()
  })
})
