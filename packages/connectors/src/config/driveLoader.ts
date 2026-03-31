import { existsSync } from 'node:fs'
import type { DriveConfig } from '../drive/types.js'
import { readYamlConfig } from './loader.js'

function parseBool(env: string | undefined, yamlVal: boolean | undefined, def: boolean): boolean {
  if (env !== undefined && env.trim() !== '') return env.trim().toLowerCase() === 'true'
  if (yamlVal !== undefined) return yamlVal
  return def
}

export function loadDriveConfig(projectRoot?: string): DriveConfig {
  const root = projectRoot ?? process.cwd()
  const yaml = readYamlConfig(root)
  const drive = yaml.connectors?.drive ?? {}

  const serviceAccountKeyPath =
    process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] ?? drive.serviceAccountKeyPath

  if (!serviceAccountKeyPath) {
    throw new Error(
      'Google Drive connector is not configured: GOOGLE_SERVICE_ACCOUNT_KEY environment variable is missing. ' +
        'Set it to the path of your service account JSON key file.',
    )
  }

  if (!existsSync(serviceAccountKeyPath)) {
    throw new Error(
      `Google Drive connector: service account key file not found at "${serviceAccountKeyPath}".`,
    )
  }

  const folderIdsEnv = process.env['GOOGLE_DRIVE_FOLDER_IDS']
  let folderIds: string[]

  if (folderIdsEnv != null && folderIdsEnv.trim() !== '') {
    folderIds = folderIdsEnv
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean)
  } else if (drive.folderIds != null && drive.folderIds.length > 0) {
    folderIds = drive.folderIds
  } else {
    throw new Error(
      'Google Drive connector is not configured: GOOGLE_DRIVE_FOLDER_IDS environment variable is missing. ' +
        'Set it to a comma-separated list of Google Drive folder IDs to index.',
    )
  }

  if (folderIds.length === 0) {
    throw new Error(
      'Google Drive connector: GOOGLE_DRIVE_FOLDER_IDS is empty. Provide at least one folder ID.',
    )
  }

  const indexDocs = parseBool(process.env['GOOGLE_INDEX_DOCS'], drive.indexDocs, true)
  const indexSheets = parseBool(process.env['GOOGLE_INDEX_SHEETS'], drive.indexSheets, true)
  const indexSlides = parseBool(process.env['GOOGLE_INDEX_SLIDES'], drive.indexSlides, true)
  const indexFiles = parseBool(process.env['GOOGLE_INDEX_FILES'], drive.indexFiles, true)

  const intervalEnv = process.env['GOOGLE_SYNC_INTERVAL_MINUTES']
  const syncIntervalMinutes =
    intervalEnv != null && intervalEnv.trim() !== ''
      ? parseInt(intervalEnv, 10)
      : (drive.syncIntervalMinutes ?? 60)

  return {
    id: 'drive',
    type: 'drive',
    enabled: true,
    syncIntervalMinutes,
    credentials: { serviceAccountKeyPath },
    serviceAccountKeyPath,
    folderIds,
    indexDocs,
    indexSheets,
    indexSlides,
    indexFiles,
  }
}
