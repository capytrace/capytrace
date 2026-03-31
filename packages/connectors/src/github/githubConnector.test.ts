import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { GitHubConfig, GitHubIssue, GitHubPR, GitHubFile, GitHubRepo } from './types.js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockTestConnection,
  mockGetRepo,
  mockGetReadme,
  mockGetIssues,
  mockGetPRs,
  mockGetWiki,
  mockGetFiles,
} = vi.hoisted(() => ({
  mockTestConnection: vi.fn<() => Promise<boolean>>(),
  mockGetRepo: vi.fn<(owner: string, repo: string) => Promise<GitHubRepo>>(),
  mockGetReadme: vi.fn<(owner: string, repo: string) => Promise<string>>(),
  mockGetIssues: vi.fn<(owner: string, repo: string) => AsyncGenerator<GitHubIssue[]>>(),
  mockGetPRs: vi.fn<(owner: string, repo: string) => AsyncGenerator<GitHubPR[]>>(),
  mockGetWiki: vi.fn<(owner: string, repo: string) => Promise<string | null>>(),
  mockGetFiles: vi.fn<
    (owner: string, repo: string, extensions: string[]) => AsyncGenerator<GitHubFile[]>
  >(),
}))

vi.mock('./githubClient.js', () => ({
  GitHubClient: class {
    testConnection = mockTestConnection
    getRepo = mockGetRepo
    getReadme = mockGetReadme
    getIssues = mockGetIssues
    getPRs = mockGetPRs
    getWiki = mockGetWiki
    getFiles = mockGetFiles
  },
}))

import { GitHubConnector } from './githubConnector.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConfig(overrides?: Partial<GitHubConfig>): GitHubConfig {
  return {
    id: 'github',
    type: 'github',
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
    codeExtensions: ['.ts', '.js'],
    ...overrides,
  }
}

function makeRepo(overrides?: Partial<GitHubRepo>): GitHubRepo {
  return {
    fullName: 'owner/repo',
    defaultBranch: 'main',
    private: false,
    description: null,
    ...overrides,
  }
}

function makeIssue(overrides?: Partial<GitHubIssue>): GitHubIssue {
  return {
    id: 1,
    number: 42,
    title: 'Bug: something broken',
    body: 'This is the issue body.',
    state: 'open',
    htmlUrl: 'https://github.com/owner/repo/issues/42',
    user: 'alice',
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-02T00:00:00Z',
    labels: ['bug', 'good first issue'],
    comments: ['Great find!', 'Working on it.'],
    ...overrides,
  }
}

function makePR(overrides?: Partial<GitHubPR>): GitHubPR {
  return {
    id: 10,
    number: 7,
    title: 'feat: add login',
    body: 'Implements the login feature.',
    state: 'merged',
    htmlUrl: 'https://github.com/owner/repo/pull/7',
    user: 'bob',
    createdAt: '2024-02-01T00:00:00Z',
    updatedAt: '2024-02-02T00:00:00Z',
    mergedAt: '2024-02-02T12:00:00Z',
    labels: ['feature'],
    baseBranch: 'main',
    headBranch: 'feat/login',
    reviewComments: ['LGTM', 'Nice implementation.'],
    ...overrides,
  }
}

function makeFile(overrides?: Partial<GitHubFile>): GitHubFile {
  return {
    path: 'src/index.ts',
    name: 'index.ts',
    content: 'export const x = 1',
    extension: '.ts',
    sha: 'abc123',
    ...overrides,
  }
}

async function* asyncGenOf<T>(...items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTestConnection.mockResolvedValue(true)
  mockGetRepo.mockResolvedValue(makeRepo())
  mockGetReadme.mockResolvedValue('')
  mockGetIssues.mockReturnValue(asyncGenOf())
  mockGetPRs.mockReturnValue(asyncGenOf())
  mockGetWiki.mockResolvedValue(null)
  mockGetFiles.mockReturnValue(asyncGenOf())
})

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------
describe('GitHubConnector.connect()', () => {
  it('resolves when token is valid', async () => {
    mockTestConnection.mockResolvedValue(true)
    await expect(new GitHubConnector(makeConfig()).connect()).resolves.toBeUndefined()
  })

  it('throws descriptive error when token is invalid', async () => {
    mockTestConnection.mockResolvedValue(false)
    await expect(new GitHubConnector(makeConfig()).connect()).rejects.toThrow(
      /GitHub connection failed/,
    )
  })
})

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------
describe('GitHubConnector.disconnect()', () => {
  it('is a no-op and resolves', async () => {
    await expect(new GitHubConnector(makeConfig()).disconnect()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sync() — indexing flags
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — indexing flags', () => {
  it('does not call getReadme when indexReadme is false', async () => {
    const connector = new GitHubConnector(makeConfig({ indexReadme: false }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockGetReadme).not.toHaveBeenCalled()
  })

  it('does not call getIssues when indexIssues is false', async () => {
    const connector = new GitHubConnector(makeConfig({ indexIssues: false }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockGetIssues).not.toHaveBeenCalled()
  })

  it('does not call getPRs when indexPRs is false', async () => {
    const connector = new GitHubConnector(makeConfig({ indexPRs: false }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockGetPRs).not.toHaveBeenCalled()
  })

  it('does not call getWiki when indexWiki is false', async () => {
    const connector = new GitHubConnector(makeConfig({ indexWiki: false }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockGetWiki).not.toHaveBeenCalled()
  })

  it('does not call getFiles when indexCode is false', async () => {
    const connector = new GitHubConnector(makeConfig({ indexCode: false }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockGetFiles).not.toHaveBeenCalled()
  })

  it('calls getFiles with configured codeExtensions when indexCode is true', async () => {
    const extensions = ['.ts', '.py']
    mockGetFiles.mockReturnValue(asyncGenOf([makeFile()]))
    const connector = new GitHubConnector(makeConfig({ indexCode: true, codeExtensions: extensions }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(mockGetFiles).toHaveBeenCalledWith('owner', 'repo', extensions)
  })

  it('yields code Documents only when indexCode is true', async () => {
    mockGetFiles.mockReturnValue(asyncGenOf([makeFile(), makeFile({ path: 'lib/utils.ts', name: 'utils.ts' })]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexIssues: false, indexPRs: false, indexWiki: false, indexCode: true }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(2)
    expect(docs[0]!.externalId).toBe('src/index.ts')
    expect(docs[0]!.sourceType).toBe('github')
  })

  it('skips repo slugs that are not in owner/repo format', async () => {
    const connector = new GitHubConnector(makeConfig({ repos: ['invalid-slug'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockGetReadme).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sync() — README document
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — README', () => {
  it('yields README document with correct fields', async () => {
    mockGetReadme.mockResolvedValue('# Hello World\n\nThis is the README.')
    const connector = new GitHubConnector(
      makeConfig({ indexIssues: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    const doc = docs[0]!
    expect(doc.externalId).toBe('readme')
    expect(doc.title).toBe('owner/repo README')
    expect(doc.sourceType).toBe('github')
    expect(doc.sourceId).toBe('owner/repo')
    expect(doc.content).toContain('Hello World')
    expect(doc.permissions).toEqual(['*'])
    expect(doc.stableId).toBe('github:owner/repo:readme')
  })

  it('skips README when content is empty', async () => {
    mockGetReadme.mockResolvedValue('   ')
    const connector = new GitHubConnector(
      makeConfig({ indexIssues: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
  })

  it('sets permissions to [] for private repos', async () => {
    mockGetRepo.mockResolvedValue(makeRepo({ private: true }))
    mockGetReadme.mockResolvedValue('# Private README')
    const connector = new GitHubConnector(
      makeConfig({ indexIssues: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs[0]!.permissions).toEqual([])
  })
})

// ---------------------------------------------------------------------------
// sync() — Issue document
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — issues', () => {
  it('fills all Document fields correctly from an issue', async () => {
    const issue = makeIssue()
    mockGetIssues.mockReturnValue(asyncGenOf([issue]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    const doc = docs[0]!
    expect(doc.externalId).toBe('42')
    expect(doc.title).toBe('Bug: something broken')
    expect(doc.content).toContain('This is the issue body.')
    expect(doc.content).toContain('Great find!')
    expect(doc.content).toContain('Working on it.')
    expect(doc.url).toBe('https://github.com/owner/repo/issues/42')
    expect(doc.author).toBe('alice')
    expect(doc.sourceType).toBe('github')
    expect(doc.sourceId).toBe('owner/repo')
    expect(doc.permissions).toEqual(['*'])
    expect(doc.metadata['number']).toBe(42)
    expect(doc.metadata['state']).toBe('open')
    expect(doc.metadata['labels']).toEqual(['bug', 'good first issue'])
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(doc.stableId).toBe('github:owner/repo:issue-42')
  })

  it('concatenates body and comments with separator', async () => {
    const issue = makeIssue({ body: 'Body text.', comments: ['Comment 1', 'Comment 2'] })
    mockGetIssues.mockReturnValue(asyncGenOf([issue]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    const content = docs[0]!.content
    expect(content).toContain('Body text.')
    expect(content).toContain('---')
    expect(content).toContain('Comment 1')
    expect(content).toContain('Comment 2')
  })

  it('omits author when issue user is null', async () => {
    mockGetIssues.mockReturnValue(asyncGenOf([makeIssue({ user: null })]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexPRs: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs[0]!.author).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sync() — PR document
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — PRs', () => {
  it('fills all Document fields correctly from a PR', async () => {
    const pr = makePR()
    mockGetPRs.mockReturnValue(asyncGenOf([pr]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexIssues: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    const doc = docs[0]!
    expect(doc.externalId).toBe('7')
    expect(doc.title).toBe('feat: add login')
    expect(doc.content).toContain('Implements the login feature.')
    expect(doc.content).toContain('LGTM')
    expect(doc.url).toBe('https://github.com/owner/repo/pull/7')
    expect(doc.author).toBe('bob')
    expect(doc.metadata['state']).toBe('merged')
    expect(doc.metadata['merged']).toBe(true)
    expect(doc.stableId).toBe('github:owner/repo:pr-7')
  })

  it('sets merged:false for open PR', async () => {
    const pr = makePR({ state: 'open', mergedAt: null })
    mockGetPRs.mockReturnValue(asyncGenOf([pr]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexIssues: false, indexWiki: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs[0]!.metadata['merged']).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// sync() — Wiki document
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — Wiki', () => {
  it('yields wiki document with correct stableId', async () => {
    mockGetWiki.mockResolvedValue('# Wiki content')
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexIssues: false, indexPRs: false }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    expect(docs[0]!.externalId).toBe('wiki')
    expect(docs[0]!.stableId).toBe('github:owner/repo:wiki')
  })
})

// ---------------------------------------------------------------------------
// sync() — File document
// ---------------------------------------------------------------------------
describe('GitHubConnector.sync() — file stableId', () => {
  it('yields file document with correct stableId', async () => {
    mockGetFiles.mockReturnValue(asyncGenOf([makeFile()]))
    const connector = new GitHubConnector(
      makeConfig({ indexReadme: false, indexIssues: false, indexPRs: false, indexWiki: false, indexCode: true }),
    )
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    expect(docs[0]!.stableId).toBe('github:owner/repo:file-src/index.ts')
  })
})
