import { getParser } from '@capytrace/core'
import type { SlackFile } from './types.js'

const MAX_SIZE_BYTES = 52_428_800 // 50 MB

/** Thrown for errors that won't be fixed by retrying (wrong scope, bad config, etc.). */
class PermanentDownloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PermanentDownloadError'
  }
}

export class FileDownloader {
  private readonly retryDelaysMs: number[]

  /**
   * @param retryDelaysMs Delays before each retry attempt. Defaults to [1000, 2000, 4000].
   *   Pass shorter delays in tests to keep them fast.
   */
  constructor(retryDelaysMs: number[] = [1000, 2000, 4000]) {
    this.retryDelaysMs = retryDelaysMs
  }

  async downloadFile(file: SlackFile, botToken: string): Promise<Buffer> {
    if (file.size > MAX_SIZE_BYTES) {
      throw new Error(
        `File "${file.name}" (${file.size} bytes) exceeds the 50 MB limit and will not be downloaded.`,
      )
    }

    // Validate extension before attempting download
    try {
      getParser(file.name)
    } catch {
      const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
      throw new Error(
        `File type "${ext}" is not supported. Supported extensions: .pdf, .docx, .txt, .md`,
      )
    }

    let lastError: Error = new Error('Unknown download error')
    const totalAttempts = this.retryDelaysMs.length + 1

    for (let attempt = 0; attempt < totalAttempts; attempt++) {
      if (attempt > 0) {
        await sleep(this.retryDelaysMs[attempt - 1]!)
      }
      try {
        const response = await fetch(file.url_private_download, {
          headers: { Authorization: `Bearer ${botToken}` },
        })
        if (!response.ok) {
          // 4xx errors are permanent — no point retrying
          if (response.status >= 400 && response.status < 500) {
            throw new PermanentDownloadError(
              `HTTP ${response.status}: ${response.statusText}`,
            )
          }
          throw new Error(`HTTP ${response.status}: ${response.statusText}`)
        }
        const contentType = response.headers.get('content-type') ?? ''
        if (contentType.startsWith('text/html')) {
          throw new PermanentDownloadError(
            `Slack returned an HTML page instead of the file content. ` +
              `Ensure the bot token has the "files:read" scope.`,
          )
        }
        return Buffer.from(await response.arrayBuffer())
      } catch (err) {
        if (err instanceof PermanentDownloadError) throw err
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    throw new Error(
      `Failed to download "${file.name}" after ${totalAttempts} attempt(s): ${lastError.message}`,
    )
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
