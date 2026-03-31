import { randomUUID } from 'node:crypto'
import type { Document, IConnector } from '@capytrace/core'
import { getParser } from '@capytrace/core'
import { DriveClient } from './driveClient.js'
import type { DriveConfig, DriveFile } from './types.js'
import {
  MIME_GOOGLE_DOC,
  MIME_GOOGLE_SHEET,
  MIME_GOOGLE_SLIDE,
  MIME_PDF,
  MIME_TEXT,
} from './types.js'

export class DriveConnector implements IConnector {
  readonly config: DriveConfig
  private client: DriveClient

  constructor(config: DriveConfig) {
    this.config = config
    this.client = new DriveClient(config.serviceAccountKeyPath)
  }

  async connect(): Promise<void> {
    const ok = await this.client.testConnection()
    if (!ok) {
      throw new Error(
        'Google Drive connection failed: could not authenticate with the service account. ' +
          'Verify that GOOGLE_SERVICE_ACCOUNT_KEY points to a valid key file with Drive access.',
      )
    }
  }

  async *sync(): AsyncGenerator<Document> {
    for (const folderId of this.config.folderIds) {
      for await (const batch of this.client.listFiles(folderId)) {
        for (const file of batch) {
          try {
            const doc = await this.processFile(file, folderId)
            if (doc !== null) yield doc
          } catch (err) {
            console.error(
              `[DriveConnector] Failed to process file "${file.name}" (${file.id}):`,
              err,
            )
          }
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // Drive API is stateless — nothing to tear down
  }

  private async processFile(file: DriveFile, folderId: string): Promise<Document | null> {
    switch (file.mimeType) {
      case MIME_GOOGLE_DOC: {
        if (!this.config.indexDocs) return null
        const buffer = await this.client.exportFile(file.id)
        return this.bufferToDocument(file, buffer, folderId)
      }
      case MIME_GOOGLE_SHEET: {
        if (!this.config.indexSheets) return null
        const buffer = await this.client.exportSheetAsCsv(file.id)
        return this.bufferToDocument(file, buffer, folderId)
      }
      case MIME_GOOGLE_SLIDE: {
        if (!this.config.indexSlides) return null
        const buffer = await this.client.exportFile(file.id)
        return this.bufferToDocument(file, buffer, folderId)
      }
      case MIME_PDF: {
        if (!this.config.indexFiles) return null
        const sizeBytes = file.size ?? 0
        const buffer = await this.client.downloadFile(file.id, sizeBytes)
        return await this.parsedFileToDocument(file, buffer, `${file.name}.pdf`, folderId)
      }
      case MIME_TEXT: {
        if (!this.config.indexFiles) return null
        const sizeBytes = file.size ?? 0
        const buffer = await this.client.downloadFile(file.id, sizeBytes)
        return await this.parsedFileToDocument(file, buffer, `${file.name}.txt`, folderId)
      }
      default:
        return null
    }
  }

  private bufferToDocument(file: DriveFile, buffer: Buffer, folderId: string): Document {
    const content = buffer.toString('utf-8')
    const doc: Document = {
      id: randomUUID(),
      stableId: `drive:${folderId}:${file.id}`,
      sourceType: 'drive',
      sourceId: folderId,
      externalId: file.id,
      title: file.name,
      content,
      createdAt: file.createdTime != null ? new Date(file.createdTime) : new Date(),
      updatedAt: file.modifiedTime != null ? new Date(file.modifiedTime) : new Date(),
      permissions: ['*'],
      metadata: {
        mimeType: file.mimeType,
        owners: file.owners,
        folderId,
        driveFileId: file.id,
      },
    }
    if (file.webViewLink != null) doc.url = file.webViewLink
    const firstOwner = file.owners[0]
    if (firstOwner !== undefined) doc.author = firstOwner
    return doc
  }

  private async parsedFileToDocument(
    file: DriveFile,
    buffer: Buffer,
    filename: string,
    folderId: string,
  ): Promise<Document> {
    const doc = await getParser(filename).parse({
      buffer,
      filename,
      sourceType: 'drive',
      sourceId: folderId,
      externalId: file.id,
      permissions: ['*'],
      stableId: `drive:${folderId}:${file.id}`,
      metadata: {
        mimeType: file.mimeType,
        owners: file.owners,
        folderId,
        driveFileId: file.id,
      },
    })
    doc.title = file.name
    doc.createdAt = file.createdTime != null ? new Date(file.createdTime) : new Date()
    doc.updatedAt = file.modifiedTime != null ? new Date(file.modifiedTime) : new Date()
    if (file.webViewLink != null) doc.url = file.webViewLink
    const firstOwner = file.owners[0]
    if (firstOwner !== undefined) doc.author = firstOwner
    return doc
  }
}
