/**
 * Google Drive smoke test
 *
 * Setup (Service Account):
 *  1. Go to https://console.cloud.google.com
 *  2. Create a project or select an existing one
 *  3. Enable the Google Drive API under "APIs & Services"
 *  4. Create a Service Account under "IAM & Admin > Service Accounts"
 *  5. Generate a JSON key and save it to ./credentials/google-service-account.json
 *  6. Share the Drive folders with the Service Account email address
 */

import { config } from '@dotenvx/dotenvx'
import { resolve } from 'node:path'
config({ path: resolve(__dirname, '../../../../.env') })

import { loadDriveConfig } from '../config/driveLoader.js'
import { DriveConnector } from './driveConnector.js'

const MIME_LABELS: Record<string, string> = {
  'application/vnd.google-apps.document': '[DOC]   ',
  'application/vnd.google-apps.spreadsheet': '[SHEET] ',
  'application/vnd.google-apps.presentation': '[SLIDE] ',
  'application/pdf': '[FILE]  ',
  'text/plain': '[FILE]  ',
}

async function main(): Promise<void> {
  console.log('Loading Google Drive config...')
  const driveConfig = loadDriveConfig()
  console.log(`Folder IDs: ${driveConfig.folderIds.join(', ')}`)

  const connector = new DriveConnector(driveConfig)
  console.log('Connecting to Google Drive...')
  await connector.connect()
  console.log('Connected!\n')

  let count = 0
  for await (const doc of connector.sync()) {
    const label = MIME_LABELS[doc.metadata['mimeType'] as string] ?? '[FILE]  '
    console.log(`[${count + 1}] ${label} ${doc.externalId} | ${doc.title.slice(0, 60)}`)
    count++
    if (count >= 20) break
  }

  console.log(`\nDone — ${count} documents yielded`)
  await connector.disconnect()
}

main().catch(console.error)
