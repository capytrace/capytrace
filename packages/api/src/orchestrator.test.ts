import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Orchestrator } from './orchestrator.js'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
const { mockAdd, mockConnect, mockDisconnect, mockSync, mockLoadSlackConfig } = vi.hoisted(() => ({
  mockAdd: vi.fn().mockResolvedValue({}),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockSync: vi.fn(),
  mockLoadSlackConfig: vi.fn(),
}))

vi.mock('@ferretsearch/core', () => ({
  indexQueue: { add: mockAdd },
}))

const SLACK_CONFIG = {
  id: 'slack-test',
  type: 'slack' as const,
  enabled: true,
  syncIntervalMinutes: 60,
  credentials: { botToken: 'xoxb-test' },
  botToken: 'xoxb-test',
  channels: [],
  syncHistoryDays: 7,
}

vi.mock('@ferretsearch/connectors', () => ({
  SlackConnector: class {
    config = SLACK_CONFIG
    connect = mockConnect
    sync = mockSync
    disconnect = mockDisconnect
  },
  loadSlackConfig: mockLoadSlackConfig,
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function* makeGen<T>(items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

/** Flush microtasks so background `void runSync()` calls can complete. */
async function flushMicrotasks(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

beforeEach(() => {
  vi.clearAllMocks()
  mockConnect.mockResolvedValue(undefined)
  mockDisconnect.mockResolvedValue(undefined)
  mockSync.mockReturnValue(makeGen([]))
  mockLoadSlackConfig.mockReturnValue(SLACK_CONFIG)
  delete process.env['SLACK_BOT_TOKEN']
})

afterEach(() => {
  delete process.env['SLACK_BOT_TOKEN']
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Orchestrator.start()', () => {
  it('loads no connectors when SLACK_BOT_TOKEN is absent', async () => {
    const orch = new Orchestrator()
    await orch.start()

    expect(mockConnect).not.toHaveBeenCalled()
    expect(orch.getStatus()).toHaveLength(0)
  })

  it('loads and connects the Slack connector when SLACK_BOT_TOKEN is set', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    expect(mockLoadSlackConfig).toHaveBeenCalledTimes(1)
    expect(mockConnect).toHaveBeenCalledTimes(1)

    const [status] = orch.getStatus()
    expect(status?.id).toBe('slack-test')
    expect(status?.type).toBe('slack')
    expect(status?.status).toBe('idle')
  })

  it('marks status as error and skips sync when connect() throws', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    mockConnect.mockRejectedValue(new Error('auth failed'))

    const orch = new Orchestrator()
    await orch.start()

    const [status] = orch.getStatus()
    expect(status?.status).toBe('error')
    expect(status?.error).toBe('auth failed')
    expect(mockSync).not.toHaveBeenCalled()
  })

  it('does not throw when loadSlackConfig raises (logs and continues)', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    mockLoadSlackConfig.mockImplementation(() => {
      throw new Error('bad config')
    })

    const orch = new Orchestrator()
    await expect(orch.start()).resolves.toBeUndefined()
    expect(orch.getStatus()).toHaveLength(0)
  })
})

describe('Orchestrator.triggerSync()', () => {
  it('returns queued:0 and empty connectors for an unknown id', async () => {
    const orch = new Orchestrator()
    const result = await orch.triggerSync('nonexistent')

    expect(result).toEqual({ queued: 0, connectors: [] })
    expect(mockAdd).not.toHaveBeenCalled()
  })

  it('queues all documents yielded by the connector', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    const doc1 = { id: 'doc-1' }
    const doc2 = { id: 'doc-2' }

    mockSync
      .mockReturnValueOnce(makeGen([]))              // initial sync from start()
      .mockReturnValueOnce(makeGen([doc1, doc2]))    // triggerSync

    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    const result = await orch.triggerSync('slack-test')

    expect(result.queued).toBe(2)
    expect(result.connectors).toEqual(['slack-test'])
    expect(mockAdd).toHaveBeenCalledWith('index', { document: doc1 })
    expect(mockAdd).toHaveBeenCalledWith('index', { document: doc2 })
  })

  it('syncs all connectors when called without an id', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    const doc = { id: 'doc-1' }

    mockSync
      .mockReturnValueOnce(makeGen([]))       // initial sync from start()
      .mockReturnValueOnce(makeGen([doc]))    // triggerSync (no id)

    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    const result = await orch.triggerSync()

    expect(result.queued).toBe(1)
    expect(result.connectors).toContain('slack-test')
  })
})

describe('Orchestrator.stop()', () => {
  it('disconnects all connectors and empties the status list', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    const orch = new Orchestrator()
    await orch.start()
    await orch.stop()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(orch.getStatus()).toHaveLength(0)
  })

  it('clears the interval so no further syncs are scheduled after stop', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    vi.useFakeTimers()

    const orch = new Orchestrator()
    await orch.start()
    await orch.stop()

    vi.advanceTimersByTime(60 * 60 * 1000 + 1000)

    // Only the one initial sync from start() — interval was cleared by stop()
    expect(mockSync).toHaveBeenCalledTimes(1)

    vi.useRealTimers()
  })
})
