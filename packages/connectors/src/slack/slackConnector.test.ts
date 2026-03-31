import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { SlackConfig, SlackMessage, SlackChannel, SlackFile } from './types.js'
import type { Document } from '@capytrace/core'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const { mockTestConnection, mockGetChannels, mockGetMessages } = vi.hoisted(() => {
  return {
    mockTestConnection: vi.fn<() => Promise<boolean>>(),
    mockGetChannels: vi.fn<(ids: string[]) => Promise<SlackChannel[]>>(),
    mockGetMessages: vi.fn<(channelId: string, oldestTs?: string) => AsyncGenerator<SlackMessage[]>>(),
  }
})

const { mockDownloadFile, mockParse, mockGetParser } = vi.hoisted(() => ({
  mockDownloadFile: vi.fn<() => Promise<Buffer>>(),
  mockParse: vi.fn<() => Promise<Document>>(),
  mockGetParser: vi.fn(),
}))

vi.mock('./slackClient.js', () => {
  return {
    SlackClient: class {
      testConnection = mockTestConnection
      getChannels = mockGetChannels
      getMessages = mockGetMessages
    },
  }
})

vi.mock('./fileDownloader.js', () => ({
  FileDownloader: class {
    downloadFile = mockDownloadFile
  },
}))

vi.mock('@capytrace/core', () => ({
  getParser: mockGetParser,
}))

import { SlackConnector } from './slackConnector.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConfig(overrides?: Partial<SlackConfig>): SlackConfig {
  return {
    id: 'slack',
    type: 'slack',
    enabled: true,
    syncIntervalMinutes: 60,
    credentials: { botToken: 'xoxb-test' },
    botToken: 'xoxb-test',
    channels: ['C001', 'C002'],
    syncHistoryDays: 30,
    ...overrides,
  }
}

async function* asyncGenOf<T>(...items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('SlackConnector.connect()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('resolves when token is valid', async () => {
    mockTestConnection.mockResolvedValueOnce(true)
    const connector = new SlackConnector(makeConfig())
    await expect(connector.connect()).resolves.toBeUndefined()
  })

  it('throws descriptive error when token is invalid', async () => {
    mockTestConnection.mockResolvedValueOnce(false)
    const connector = new SlackConnector(makeConfig())
    await expect(connector.connect()).rejects.toThrowError(/Slack connection failed/)
  })
})

describe('SlackConnector.sync()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('yields Documents for each message in configured channels', async () => {
    const channels: SlackChannel[] = [
      { id: 'C001', name: 'general', is_private: false },
      { id: 'C002', name: 'random', is_private: false },
    ]
    const messagesC001: SlackMessage[] = [
      { ts: '1700000000.000001', text: 'Hello world', user: 'U001', type: 'message' },
      { ts: '1700000001.000002', text: 'Second message', user: 'U002', type: 'message' },
    ]
    const messagesC002: SlackMessage[] = [
      { ts: '1700000002.000003', text: 'Random channel message', type: 'message' },
    ]

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages
      .mockImplementationOnce(() => asyncGenOf(messagesC001))
      .mockImplementationOnce(() => asyncGenOf(messagesC002))

    const connector = new SlackConnector(makeConfig())
    const docs = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(3)
    expect(docs[0]!.sourceType).toBe('slack')
    expect(docs[0]!.externalId).toBe('1700000000.000001')
    expect(docs[0]!.content).toBe('Hello world')
  })

  it('skips messages with empty text', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const messages: SlackMessage[] = [
      { ts: '1700000000.000001', text: '', type: 'message' },
      { ts: '1700000001.000002', text: '   ', type: 'message' },
      { ts: '1700000002.000003', text: 'Valid message', type: 'message' },
    ]

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf(messages))

    const connector = new SlackConnector(makeConfig())
    const docs = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(1)
    expect(docs[0]!.content).toBe('Valid message')
  })
})

describe('messageToDocument() via sync()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('fills all Document fields correctly', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const longText = 'A'.repeat(100)
    const message: SlackMessage = {
      ts: '1700000000.123456',
      text: longText,
      user: 'U999',
      thread_ts: '1699999999.000000',
      reactions: [{ name: 'thumbsup', count: 3, users: ['U001', 'U002', 'U003'] }],
      type: 'message',
    }

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf([message]))

    const connector = new SlackConnector(makeConfig())
    const docs = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(1)
    const doc = docs[0]!

    // sourceType
    expect(doc.sourceType).toBe('slack')

    // title is first 80 chars
    expect(doc.title).toBe('A'.repeat(80))
    expect(doc.title.length).toBe(80)

    // content is full text
    expect(doc.content).toBe(longText)

    // externalId is the ts
    expect(doc.externalId).toBe('1700000000.123456')

    // sourceId is channelId
    expect(doc.sourceId).toBe('C001')

    // author
    expect(doc.author).toBe('U999')

    // permissions are public
    expect(doc.permissions).toEqual(['*'])

    // metadata
    expect(doc.metadata['channelId']).toBe('C001')
    expect(doc.metadata['channelName']).toBe('general')
    expect(doc.metadata['threadTs']).toBe('1699999999.000000')
    expect(doc.metadata['reactions']).toEqual([
      { name: 'thumbsup', count: 3, users: ['U001', 'U002', 'U003'] },
    ])

    // createdAt derived from ts
    expect(doc.createdAt).toBeInstanceOf(Date)
    expect(doc.createdAt.getTime()).toBeCloseTo(1700000000.123456 * 1000, -2)

    // id is a UUID
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/)

    // stableId is deterministic
    expect(doc.stableId).toBe('slack:C001:1700000000.123456')
  })

  it('sets threadTs to null when message is not a thread reply', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const message: SlackMessage = {
      ts: '1700000000.000001',
      text: 'Top-level message',
      type: 'message',
    }

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf([message]))

    const connector = new SlackConnector(makeConfig())
    const docs = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    expect(docs[0]!.metadata['threadTs']).toBeNull()
  })
})

describe('SlackConnector.disconnect()', () => {
  it('is a no-op and resolves successfully', async () => {
    const connector = new SlackConnector(makeConfig())
    await expect(connector.disconnect()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// File attachment tests
// ---------------------------------------------------------------------------
function makePdfFile(overrides?: Partial<SlackFile>): SlackFile {
  return {
    id: 'F001',
    name: 'report.pdf',
    filetype: 'pdf',
    url_private_download: 'https://files.slack.com/report.pdf',
    size: 1024,
    mimetype: 'application/pdf',
    ...overrides,
  }
}

function makeFileDoc(overrides?: Partial<Document>): Document {
  return {
    id: 'doc-file-001',
    stableId: 'slack:C001:file-F001',
    sourceType: 'slack',
    sourceId: 'C001',
    externalId: 'F001',
    title: 'report.pdf',
    content: 'PDF content extracted by parser',
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    permissions: ['*'],
    metadata: {},
    ...overrides,
  }
}

describe('SlackConnector file attachments', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('message with PDF file yields 2 Documents: one for message text, one for file', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const message: SlackMessage = {
      ts: '1700000000.000001',
      text: 'plano do capytrace search',
      user: 'U001',
      type: 'message',
      files: [makePdfFile()],
    }

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf([message]))
    mockDownloadFile.mockResolvedValueOnce(Buffer.from('pdf bytes'))
    const parsedFileDoc = makeFileDoc()
    mockGetParser.mockReturnValue({ parse: mockParse })
    mockParse.mockResolvedValueOnce(parsedFileDoc)

    const connector = new SlackConnector(makeConfig())
    const docs: Document[] = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    expect(docs).toHaveLength(2)

    // First document: the text message
    expect(docs[0]!.externalId).toBe('1700000000.000001')
    expect(docs[0]!.content).toBe('plano do capytrace search')
    expect(docs[0]!.stableId).toBe('slack:C001:1700000000.000001')

    // Second document: the file
    expect(docs[1]!.title).toBe('report.pdf')
    expect(docs[1]!.url).toBe('https://files.slack.com/report.pdf')
    expect(docs[1]!.stableId).toBe('slack:C001:file-F001')
  })

  it('download error does not interrupt sync of remaining messages', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const messages: SlackMessage[] = [
      {
        ts: '1700000001.000001',
        text: 'message with broken file',
        type: 'message',
        files: [makePdfFile()],
      },
      {
        ts: '1700000002.000002',
        text: 'message without files',
        type: 'message',
      },
    ]

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf(messages))
    mockDownloadFile.mockRejectedValueOnce(new Error('connection timeout'))

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const connector = new SlackConnector(makeConfig())
    const docs: Document[] = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    // Both text messages yielded, file skipped
    expect(docs).toHaveLength(2)
    expect(docs[0]!.content).toBe('message with broken file')
    expect(docs[1]!.content).toBe('message without files')
    expect(consoleSpy).toHaveBeenCalledOnce()

    consoleSpy.mockRestore()
  })

  it('unsupported file type is skipped without throwing', async () => {
    const channels: SlackChannel[] = [{ id: 'C001', name: 'general', is_private: false }]
    const message: SlackMessage = {
      ts: '1700000001.000001',
      text: 'check this image',
      type: 'message',
      files: [makePdfFile({ name: 'photo.png', filetype: 'png', id: 'F002' })],
    }

    mockGetChannels.mockResolvedValue(channels)
    mockGetMessages.mockImplementationOnce(() => asyncGenOf([message]))
    mockDownloadFile.mockRejectedValueOnce(
      new Error('File type ".png" is not supported. Supported extensions: .pdf, .docx, .txt, .md'),
    )

    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined)

    const connector = new SlackConnector(makeConfig())
    const docs: Document[] = []
    for await (const doc of connector.sync()) {
      docs.push(doc)
    }

    // Only the text document is yielded
    expect(docs).toHaveLength(1)
    expect(docs[0]!.content).toBe('check this image')
    expect(consoleSpy).toHaveBeenCalledOnce()

    consoleSpy.mockRestore()
  })
})
