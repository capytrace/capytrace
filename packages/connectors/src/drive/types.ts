import type { ConnectorConfig } from '@capytrace/core'

export interface DriveConfig extends ConnectorConfig {
  type: 'drive'
  serviceAccountKeyPath: string
  folderIds: string[]
  indexDocs: boolean
  indexSheets: boolean
  indexSlides: boolean
  indexFiles: boolean
}

export interface DriveFile {
  id: string
  name: string
  mimeType: string
  webViewLink: string | null
  createdTime: string | null
  modifiedTime: string | null
  owners: string[]
  size: number | null
}

export const MIME_GOOGLE_DOC = 'application/vnd.google-apps.document'
export const MIME_GOOGLE_SHEET = 'application/vnd.google-apps.spreadsheet'
export const MIME_GOOGLE_SLIDE = 'application/vnd.google-apps.presentation'
export const MIME_PDF = 'application/pdf'
export const MIME_TEXT = 'text/plain'
