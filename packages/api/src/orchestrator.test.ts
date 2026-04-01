import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { Orchestrator } from './orchestrator.js'

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------
const {
  mockAdd,
  mockConnect,
  mockDisconnect,
  mockSync,
  mockLoadSlackConfig,
  mockGithubConnect,
  mockGithubDisconnect,
  mockGithubSync,
  mockLoadGitHubConfig,
  mockLoadPlugin,
} = vi.hoisted(() => ({
  mockAdd: vi.fn().mockResolvedValue({}),
  mockConnect: vi.fn().mockResolvedValue(undefined),
  mockDisconnect: vi.fn().mockResolvedValue(undefined),
  mockSync: vi.fn(),
  mockLoadSlackConfig: vi.fn(),
  mockGithubConnect: vi.fn().mockResolvedValue(undefined),
  mockGithubDisconnect: vi.fn().mockResolvedValue(undefined),
  mockGithubSync: vi.fn(),
  mockLoadGitHubConfig: vi.fn(),
  mockLoadPlugin: vi.fn(),
}))

vi.mock('@capytrace/core', () => ({
  indexQueue: { add: mockAdd },
}))

vi.mock('@capytrace/sdk', () => ({
  loadPlugin: mockLoadPlugin,
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

const GITHUB_CONFIG = {
  id: 'github',
  type: 'github' as const,
  enabled: true,
  syncIntervalMinutes: 60,
  credentials: { token: 'ghp-test' },
  token: 'ghp-test',
  repos: ['owner/repo'],
  indexReadme: true,
  indexIssues: true,
  indexPRs: true,
  indexWiki: true,
  indexCode: false,
  codeExtensions: ['.ts'],
}

vi.mock('@capytrace/connectors', () => ({
  SlackConnector: class {
    config = SLACK_CONFIG
    connect = mockConnect
    sync = mockSync
    disconnect = mockDisconnect
  },
  loadSlackConfig: mockLoadSlackConfig,
  GitHubConnector: class {
    config = GITHUB_CONFIG
    connect = mockGithubConnect
    sync = mockGithubSync
    disconnect = mockGithubDisconnect
  },
  loadGitHubConfig: mockLoadGitHubConfig,
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
  mockGithubConnect.mockResolvedValue(undefined)
  mockGithubDisconnect.mockResolvedValue(undefined)
  mockGithubSync.mockReturnValue(makeGen([]))
  mockLoadGitHubConfig.mockReturnValue(GITHUB_CONFIG)
  mockLoadPlugin.mockResolvedValue(undefined)
  delete process.env['SLACK_BOT_TOKEN']
  delete process.env['GITHUB_TOKEN']
  delete process.env['CAPYTRACE_PLUGINS']
})

afterEach(() => {
  delete process.env['SLACK_BOT_TOKEN']
  delete process.env['GITHUB_TOKEN']
  delete process.env['CAPYTRACE_PLUGINS']
})

// ---------------------------------------------------------------------------
// Slack tests (unchanged)
// ---------------------------------------------------------------------------
describe('Orchestrator.start()', () => {
  it('loads no connectors when no tokens are set', async () => {
    const orch = new Orchestrator()
    await orch.start()

    expect(mockConnect).not.toHaveBeenCalled()
    expect(mockGithubConnect).not.toHaveBeenCalled()
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
    mockLoadSlackConfig.mockImplementation(() => { throw new Error('bad config') })

    const orch = new Orchestrator()
    await expect(orch.start()).resolves.toBeUndefined()
    expect(orch.getStatus()).toHaveLength(0)
  })

  // ── GitHub ─────────────────────────────────────────────────────────────
  it('loads and connects the GitHub connector when GITHUB_TOKEN is set', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    expect(mockLoadGitHubConfig).toHaveBeenCalledTimes(1)
    expect(mockGithubConnect).toHaveBeenCalledTimes(1)

    const [status] = orch.getStatus()
    expect(status?.id).toBe('github')
    expect(status?.type).toBe('github')
  })

  it('loads both connectors when both tokens are set', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    expect(orch.getStatus()).toHaveLength(2)
  })

  it('does not throw when loadGitHubConfig raises (logs and continues)', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    mockLoadGitHubConfig.mockImplementation(() => { throw new Error('bad github config') })

    const orch = new Orchestrator()
    await expect(orch.start()).resolves.toBeUndefined()
    expect(orch.getStatus()).toHaveLength(0)
  })

  it('marks GitHub connector as error when connect() throws', async () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    mockGithubConnect.mockRejectedValue(new Error('invalid token'))

    const orch = new Orchestrator()
    await orch.start()

    const [status] = orch.getStatus()
    expect(status?.status).toBe('error')
    expect(status?.error).toBe('invalid token')
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
      .mockReturnValueOnce(makeGen([]))
      .mockReturnValueOnce(makeGen([doc1, doc2]))

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
      .mockReturnValueOnce(makeGen([]))
      .mockReturnValueOnce(makeGen([doc]))

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

  it('disconnects both connectors when both are active', async () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-test'
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    const orch = new Orchestrator()
    await orch.start()
    await orch.stop()

    expect(mockDisconnect).toHaveBeenCalledTimes(1)
    expect(mockGithubDisconnect).toHaveBeenCalledTimes(1)
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

// ---------------------------------------------------------------------------
// Plugin loading via CAPYTRACE_PLUGINS
// ---------------------------------------------------------------------------
describe('Orchestrator plugin loading', () => {
  const pluginSync = vi.fn()
  const pluginConnect = vi.fn().mockResolvedValue(undefined)
  const pluginDisconnect = vi.fn().mockResolvedValue(undefined)

  const fakePlugin = {
    manifest: {
      name: 'notion-connector',
      version: '1.0.0',
      description: 'Notion',
      author: 'Test',
      sourceType: 'filesystem',
      configSchema: {},
    },
    createConnector: () => ({
      config: { id: 'notion-connector', type: 'filesystem', enabled: true, syncIntervalMinutes: 60, credentials: {} },
      connect: pluginConnect,
      sync: pluginSync,
      disconnect: pluginDisconnect,
    }),
  }

  beforeEach(() => {
    pluginSync.mockReturnValue(makeGen([]))
    pluginConnect.mockResolvedValue(undefined)
    pluginDisconnect.mockResolvedValue(undefined)
  })

  it('does not call loadPlugin when CAPYTRACE_PLUGINS is not set', async () => {
    const orch = new Orchestrator()
    await orch.start()
    expect(mockLoadPlugin).not.toHaveBeenCalled()
  })

  it('calls loadPlugin for each path in CAPYTRACE_PLUGINS', async () => {
    process.env['CAPYTRACE_PLUGINS'] = './plugins/a.js,./plugins/b.js'
    mockLoadPlugin.mockResolvedValue(fakePlugin)

    const orch = new Orchestrator()
    await orch.start()

    expect(mockLoadPlugin).toHaveBeenCalledTimes(2)
    expect(mockLoadPlugin).toHaveBeenCalledWith('./plugins/a.js')
    expect(mockLoadPlugin).toHaveBeenCalledWith('./plugins/b.js')
  })

  it('registers the connector from a loaded plugin', async () => {
    process.env['CAPYTRACE_PLUGINS'] = './plugins/notion.js'
    mockLoadPlugin.mockResolvedValue(fakePlugin)

    const orch = new Orchestrator()
    await orch.start()
    await flushMicrotasks()

    const status = orch.getStatus().find((s) => s.id === 'notion-connector')
    expect(status).toBeDefined()
    expect(status?.type).toBe('filesystem')
  })

  it('logs and continues when loadPlugin throws', async () => {
    process.env['CAPYTRACE_PLUGINS'] = './plugins/bad.js'
    mockLoadPlugin.mockRejectedValue(new Error('module not found'))

    const orch = new Orchestrator()
    await expect(orch.start()).resolves.toBeUndefined()
    expect(orch.getStatus()).toHaveLength(0)
  })
})
