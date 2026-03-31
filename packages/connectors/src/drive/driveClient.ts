import { google } from 'googleapis'
import type { DriveFile } from './types.js'

const MAX_SIZE_BYTES = 52_428_800 // 50 MB
const RATE_LIMIT_DELAY_MS = 100   // 100ms between requests → max ~10 req/s

export class DriveClient {
  private drive: ReturnType<typeof google.drive>

  constructor(serviceAccountKeyPath: string) {
    const auth = new google.auth.GoogleAuth({
      keyFile: serviceAccountKeyPath,
      scopes: ['https://www.googleapis.com/auth/drive.readonly'],
    })
    this.drive = google.drive({ version: 'v3', auth })
  }

  async testConnection(): Promise<boolean> {
    try {
      await this.drive.files.list({ pageSize: 1, fields: 'files(id)' })
      return true
    } catch {
      return false
    }
  }

  async *listFiles(folderId?: string): AsyncGenerator<DriveFile[]> {
    const q = folderId ? `'${folderId}' in parents and trashed = false` : 'trashed = false'
    let pageToken: string | undefined

    do {
      await sleep(RATE_LIMIT_DELAY_MS)
      const res = await this.drive.files.list({
        q,
        fields: 'nextPageToken, files(id, name, mimeType, webViewLink, createdTime, modifiedTime, owners, size)',
        pageSize: 100,
        ...(pageToken !== undefined ? { pageToken } : {}),
      })

      const files = res.data.files ?? []
      const mapped: DriveFile[] = files.map((f) => ({
        id: f.id ?? '',
        name: f.name ?? '',
        mimeType: f.mimeType ?? '',
        webViewLink: f.webViewLink ?? null,
        createdTime: f.createdTime ?? null,
        modifiedTime: f.modifiedTime ?? null,
        owners: (f.owners ?? []).map((o) => o.emailAddress ?? '').filter(Boolean),
        size: f.size != null ? parseInt(String(f.size), 10) : null,
      }))

      if (mapped.length > 0) yield mapped
      pageToken = res.data.nextPageToken ?? undefined
    } while (pageToken !== undefined)
  }

  async exportFile(fileId: string): Promise<Buffer> {
    await sleep(RATE_LIMIT_DELAY_MS)
    const res = await this.drive.files.export(
      { fileId, mimeType: 'text/plain' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }

  async exportSheetAsCsv(fileId: string): Promise<Buffer> {
    await sleep(RATE_LIMIT_DELAY_MS)
    const res = await this.drive.files.export(
      { fileId, mimeType: 'text/csv' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }

  async downloadFile(fileId: string, sizeBytes: number): Promise<Buffer> {
    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new Error(
        `File (${sizeBytes} bytes) exceeds the 50 MB limit and will not be downloaded.`,
      )
    }
    await sleep(RATE_LIMIT_DELAY_MS)
    const res = await this.drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'arraybuffer' },
    )
    return Buffer.from(res.data as ArrayBuffer)
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
