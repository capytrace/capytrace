import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type { SlackFile } from './types.js'

// ---------------------------------------------------------------------------
// Mock @capytrace/core so getParser is controllable
// ---------------------------------------------------------------------------
const { mockGetParser } = vi.hoisted(() => ({
  mockGetParser: vi.fn(),
}))

vi.mock('@capytrace/core', () => ({
  getParser: mockGetParser,
}))

import { FileDownloader } from './fileDownloader.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const BOT_TOKEN = 'xoxb-test-token'

function makeFile(overrides?: Partial<SlackFile>): SlackFile {
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

// Instantiate with zero delays so tests are instant
function makeDownloader(): FileDownloader {
  return new FileDownloader([0, 0, 0])
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('FileDownloader.downloadFile()', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default: getParser returns a parser object (type is supported)
    mockGetParser.mockReturnValue({})
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns correct buffer on successful download', async () => {
    const content = 'PDF content bytes'
    const mockFetch = vi.fn().mockResolvedValueOnce(
      new Response(content, { status: 200 }),
    )
    vi.stubGlobal('fetch', mockFetch)

    const downloader = makeDownloader()
    const buffer = await downloader.downloadFile(makeFile(), BOT_TOKEN)

    expect(buffer).toBeInstanceOf(Buffer)
    expect(buffer.toString()).toBe(content)
    expect(mockFetch).toHaveBeenCalledOnce()
    expect(mockFetch).toHaveBeenCalledWith(
      'https://files.slack.com/report.pdf',
      { headers: { Authorization: `Bearer ${BOT_TOKEN}` } },
    )
  })

  it('retries when fetch fails on first attempt and succeeds on second', async () => {
    const content = 'recovered content'
    const mockFetch = vi.fn()
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce(new Response(content, { status: 200 }))
    vi.stubGlobal('fetch', mockFetch)

    const downloader = makeDownloader()
    const buffer = await downloader.downloadFile(makeFile(), BOT_TOKEN)

    expect(mockFetch).toHaveBeenCalledTimes(2)
    expect(buffer.toString()).toBe(content)
  })

  it('throws descriptive error after all retries are exhausted', async () => {
    const mockFetch = vi.fn().mockRejectedValue(new Error('connection refused'))
    vi.stubGlobal('fetch', mockFetch)

    const downloader = makeDownloader()

    await expect(downloader.downloadFile(makeFile(), BOT_TOKEN)).rejects.toThrowError(
      /Failed to download "report\.pdf" after 4 attempt\(s\)/,
    )
    // 1 initial + 3 retries = 4 total calls
    expect(mockFetch).toHaveBeenCalledTimes(4)
  })

  it('throws before downloading when file exceeds 50 MB', async () => {
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const bigFile = makeFile({ size: 52_428_801 })
    const downloader = makeDownloader()

    await expect(downloader.downloadFile(bigFile, BOT_TOKEN)).rejects.toThrowError(
      /exceeds the 50 MB limit/,
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })

  it('throws before downloading when file type is not supported', async () => {
    mockGetParser.mockImplementationOnce(() => {
      throw new Error('No parser found for extension: .png')
    })
    const mockFetch = vi.fn()
    vi.stubGlobal('fetch', mockFetch)

    const pngFile = makeFile({ name: 'photo.png', filetype: 'png' })
    const downloader = makeDownloader()

    await expect(downloader.downloadFile(pngFile, BOT_TOKEN)).rejects.toThrowError(
      /File type "\.png" is not supported/,
    )
    expect(mockFetch).not.toHaveBeenCalled()
  })
})
