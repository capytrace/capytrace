import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { DriveConfig, DriveFile } from './types.js'
import type { Document } from '@capytrace/core'
import {
  MIME_GOOGLE_DOC,
  MIME_GOOGLE_SHEET,
  MIME_GOOGLE_SLIDE,
  MIME_PDF,
  MIME_TEXT,
} from './types.js'

// ---------------------------------------------------------------------------
// Hoisted mocks
// ---------------------------------------------------------------------------
const {
  mockTestConnection,
  mockListFiles,
  mockExportFile,
  mockExportSheetAsCsv,
  mockDownloadFile,
  mockGetParser,
  mockParse,
} = vi.hoisted(() => ({
  mockTestConnection: vi.fn<() => Promise<boolean>>(),
  mockListFiles: vi.fn<(folderId?: string) => AsyncGenerator<DriveFile[]>>(),
  mockExportFile: vi.fn<(fileId: string) => Promise<Buffer>>(),
  mockExportSheetAsCsv: vi.fn<(fileId: string) => Promise<Buffer>>(),
  mockDownloadFile: vi.fn<(fileId: string, sizeBytes: number) => Promise<Buffer>>(),
  mockGetParser: vi.fn(),
  mockParse: vi.fn<() => Promise<Document>>(),
}))

vi.mock('./driveClient.js', () => ({
  DriveClient: class {
    testConnection = mockTestConnection
    listFiles = mockListFiles
    exportFile = mockExportFile
    exportSheetAsCsv = mockExportSheetAsCsv
    downloadFile = mockDownloadFile
  },
}))

vi.mock('@capytrace/core', () => ({
  getParser: mockGetParser,
}))

import { DriveConnector } from './driveConnector.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeConfig(overrides?: Partial<DriveConfig>): DriveConfig {
  return {
    id: 'drive',
    type: 'drive',
    enabled: true,
    syncIntervalMinutes: 60,
    credentials: { serviceAccountKeyPath: '/key.json' },
    serviceAccountKeyPath: '/key.json',
    folderIds: [],
    indexDocs: true,
    indexSheets: true,
    indexSlides: true,
    indexFiles: true,
    ...overrides,
  }
}

function makeFile(overrides?: Partial<DriveFile>): DriveFile {
  return {
    id: 'file-001',
    name: 'My Document',
    mimeType: MIME_GOOGLE_DOC,
    webViewLink: 'https://docs.google.com/document/d/file-001/edit',
    createdTime: '2024-01-01T00:00:00.000Z',
    modifiedTime: '2024-01-02T00:00:00.000Z',
    owners: ['alice@example.com'],
    size: null,
    ...overrides,
  }
}

async function* asyncGenOf<T>(...items: T[]): AsyncGenerator<T> {
  for (const item of items) yield item
}

beforeEach(() => {
  vi.clearAllMocks()
  mockTestConnection.mockResolvedValue(true)
  mockListFiles.mockReturnValue(asyncGenOf())
  mockExportFile.mockResolvedValue(Buffer.from('doc content'))
  mockExportSheetAsCsv.mockResolvedValue(Buffer.from('col1,col2\nval1,val2'))
  mockDownloadFile.mockResolvedValue(Buffer.from('%PDF-1.4 test'))
  mockGetParser.mockReturnValue({ parse: mockParse })
})

// ---------------------------------------------------------------------------
// connect()
// ---------------------------------------------------------------------------
describe('DriveConnector.connect()', () => {
  it('resolves when service account credentials are valid', async () => {
    await expect(new DriveConnector(makeConfig()).connect()).resolves.toBeUndefined()
  })

  it('throws descriptive error when credentials are invalid', async () => {
    mockTestConnection.mockResolvedValue(false)
    await expect(new DriveConnector(makeConfig()).connect()).rejects.toThrow(
      /Google Drive connection failed/,
    )
  })
})

// ---------------------------------------------------------------------------
// disconnect()
// ---------------------------------------------------------------------------
describe('DriveConnector.disconnect()', () => {
  it('is a no-op and resolves', async () => {
    await expect(new DriveConnector(makeConfig()).disconnect()).resolves.toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sync() — indexing flags
// ---------------------------------------------------------------------------
describe('DriveConnector.sync() — indexing flags', () => {
  it('skips Google Docs when indexDocs is false', async () => {
    mockListFiles.mockReturnValue(asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_DOC })]))
    const connector = new DriveConnector(makeConfig({ indexDocs: false, folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockExportFile).not.toHaveBeenCalled()
  })

  it('skips Google Sheets when indexSheets is false', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_SHEET, name: 'Budget' })]),
    )
    const connector = new DriveConnector(makeConfig({ indexSheets: false, folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockExportSheetAsCsv).not.toHaveBeenCalled()
  })

  it('skips Google Slides when indexSlides is false', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_SLIDE, name: 'Presentation' })]),
    )
    const connector = new DriveConnector(makeConfig({ indexSlides: false, folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockExportFile).not.toHaveBeenCalled()
  })

  it('skips binary files when indexFiles is false', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_PDF, name: 'report.pdf', size: 1024 })]),
    )
    const connector = new DriveConnector(makeConfig({ indexFiles: false, folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockDownloadFile).not.toHaveBeenCalled()
  })

  it('skips text files when indexFiles is false', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_TEXT, name: 'notes.txt', size: 512 })]),
    )
    const connector = new DriveConnector(makeConfig({ indexFiles: false, folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
    expect(mockDownloadFile).not.toHaveBeenCalled()
  })

  it('skips files with unsupported MIME types', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: 'application/vnd.google-apps.folder', name: 'Folder' })]),
    )
    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs).toHaveLength(0)
  })

  it('calls listFiles for each folderId', async () => {
    const connector = new DriveConnector(
      makeConfig({ folderIds: ['folder-abc', 'folder-def'] }),
    )
    for await (const doc of connector.sync()) {
      void doc
    }
    expect(mockListFiles).toHaveBeenCalledTimes(2)
    expect(mockListFiles).toHaveBeenCalledWith('folder-abc')
    expect(mockListFiles).toHaveBeenCalledWith('folder-def')
  })

  it('does not call listFiles when folderIds is empty', async () => {
    const connector = new DriveConnector(makeConfig({ folderIds: [] }))
    for await (const doc of connector.sync()) {
      void doc
    }
    expect(mockListFiles).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// sync() — Google Doc document
// ---------------------------------------------------------------------------
describe('DriveConnector.sync() — Google Doc', () => {
  it('yields document with correct fields from a Google Doc', async () => {
    const file = makeFile({ mimeType: MIME_GOOGLE_DOC })
    mockListFiles.mockReturnValue(asyncGenOf([file]))
    mockExportFile.mockResolvedValue(Buffer.from('Hello World content'))

    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    const doc = docs[0]!
    expect(doc.externalId).toBe('file-001')
    expect(doc.title).toBe('My Document')
    expect(doc.content).toBe('Hello World content')
    expect(doc.sourceType).toBe('drive')
    expect(doc.sourceId).toBe('folder-1')
    expect(doc.url).toBe('https://docs.google.com/document/d/file-001/edit')
    expect(doc.author).toBe('alice@example.com')
    expect(doc.metadata['mimeType']).toBe(MIME_GOOGLE_DOC)
    expect(doc.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(doc.stableId).toBe('drive:folder-1:file-001')
  })

  it('calls exportFile for Google Docs', async () => {
    mockListFiles.mockReturnValue(asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_DOC })]))
    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    for await (const doc of connector.sync()) { void doc }
    expect(mockExportFile).toHaveBeenCalledWith('file-001')
  })

  it('omits url when webViewLink is null', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_DOC, webViewLink: null })]),
    )
    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs[0]!.url).toBeUndefined()
  })

  it('omits author when owners list is empty', async () => {
    mockListFiles.mockReturnValue(
      asyncGenOf([makeFile({ mimeType: MIME_GOOGLE_DOC, owners: [] })]),
    )
    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)
    expect(docs[0]!.author).toBeUndefined()
  })
})

// ---------------------------------------------------------------------------
// sync() — Google Sheet document
// ---------------------------------------------------------------------------
describe('DriveConnector.sync() — Google Sheet', () => {
  it('calls exportSheetAsCsv and yields document', async () => {
    const file = makeFile({ mimeType: MIME_GOOGLE_SHEET, name: 'Budget 2024' })
    mockListFiles.mockReturnValue(asyncGenOf([file]))
    mockExportSheetAsCsv.mockResolvedValue(Buffer.from('col1,col2\nval1,val2'))

    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    expect(docs[0]!.content).toBe('col1,col2\nval1,val2')
    expect(mockExportSheetAsCsv).toHaveBeenCalledWith('file-001')
  })
})

// ---------------------------------------------------------------------------
// sync() — error handling
// ---------------------------------------------------------------------------
describe('DriveConnector.sync() — error handling', () => {
  it('continues syncing after a per-file error', async () => {
    const file1 = makeFile({ id: 'file-001', name: 'Doc 1', mimeType: MIME_GOOGLE_DOC })
    const file2 = makeFile({ id: 'file-002', name: 'Doc 2', mimeType: MIME_GOOGLE_DOC })
    mockListFiles.mockReturnValue(asyncGenOf([file1, file2]))
    mockExportFile
      .mockRejectedValueOnce(new Error('export failed'))
      .mockResolvedValueOnce(Buffer.from('Doc 2 content'))

    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    expect(docs[0]!.title).toBe('Doc 2')
  })
})

// ---------------------------------------------------------------------------
// sync() — parsedFileToDocument (PDF/TXT via getParser)
// ---------------------------------------------------------------------------
describe('DriveConnector.sync() — parsedFileToDocument', () => {
  it('yields PDF document with correct stableId', async () => {
    const file = makeFile({ mimeType: MIME_PDF, name: 'report.pdf', size: 1024 })
    mockListFiles.mockReturnValue(asyncGenOf([file]))
    mockDownloadFile.mockResolvedValue(Buffer.from('%PDF-1.4 test'))
    const parsedDoc: Document = {
      id: 'parsed-doc-001',
      stableId: 'drive:folder-1:file-001',
      sourceType: 'drive',
      sourceId: 'folder-1',
      externalId: 'file-001',
      title: 'report.pdf',
      content: 'PDF extracted content',
      createdAt: new Date('2024-01-01'),
      updatedAt: new Date('2024-01-02'),
      permissions: ['*'],
      metadata: {},
    }
    mockParse.mockResolvedValueOnce(parsedDoc)

    const connector = new DriveConnector(makeConfig({ folderIds: ['folder-1'] }))
    const docs = []
    for await (const doc of connector.sync()) docs.push(doc)

    expect(docs).toHaveLength(1)
    expect(docs[0]!.stableId).toBe('drive:folder-1:file-001')
    expect(mockParse).toHaveBeenCalledWith(
      expect.objectContaining({ stableId: 'drive:folder-1:file-001' }),
    )
  })
})
