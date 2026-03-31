import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadDriveConfig } from './driveLoader.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `capytrace-drive-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

function makeKeyFile(dir: string, name = 'key.json'): string {
  const keyPath = join(dir, name)
  writeFileSync(keyPath, JSON.stringify({ type: 'service_account' }))
  return keyPath
}

const ENV_KEYS = [
  'GOOGLE_SERVICE_ACCOUNT_KEY',
  'GOOGLE_DRIVE_FOLDER_IDS',
  'GOOGLE_INDEX_DOCS',
  'GOOGLE_INDEX_SHEETS',
  'GOOGLE_INDEX_SLIDES',
  'GOOGLE_INDEX_FILES',
  'GOOGLE_SYNC_INTERVAL_MINUTES',
] as const

describe('loadDriveConfig', () => {
  let saved: Record<string, string | undefined>

  beforeEach(() => {
    saved = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]))
    ENV_KEYS.forEach((k) => { delete process.env[k] })
  })

  afterEach(() => {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k]
      else process.env[k] = v
    }
  })

  // ── required fields ────────────────────────────────────────────────────
  it('throws when GOOGLE_SERVICE_ACCOUNT_KEY is absent', () => {
    const dir = makeTempDir()
    try {
      expect(() => loadDriveConfig(dir)).toThrowError(/GOOGLE_SERVICE_ACCOUNT_KEY/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when service account JSON file does not exist', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = join(dir, 'nonexistent.json')
      expect(() => loadDriveConfig(dir)).toThrowError(/not found/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when GOOGLE_DRIVE_FOLDER_IDS is absent', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      expect(() => loadDriveConfig(dir)).toThrowError(/GOOGLE_DRIVE_FOLDER_IDS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when GOOGLE_DRIVE_FOLDER_IDS is an empty string', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = '   '
      expect(() => loadDriveConfig(dir)).toThrowError(/GOOGLE_DRIVE_FOLDER_IDS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── folderIds ──────────────────────────────────────────────────────────
  it('parses comma-separated folder IDs', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = 'id1, id2, id3'
      const config = loadDriveConfig(dir)
      expect(config.folderIds).toEqual(['id1', 'id2', 'id3'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads folderIds from YAML when env var is absent', () => {
    const dir = makeTempDir()
    try {
      const keyPath = makeKeyFile(dir)
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  drive:',
          `    serviceAccountKeyPath: ${keyPath}`,
          '    folderIds:',
          '      - yaml-folder-1',
          '      - yaml-folder-2',
        ].join('\n'),
      )
      const config = loadDriveConfig(dir)
      expect(config.folderIds).toEqual(['yaml-folder-1', 'yaml-folder-2'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── boolean defaults ───────────────────────────────────────────────────
  it('defaults all index flags to true', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = 'folder-1'
      const config = loadDriveConfig(dir)
      expect(config.indexDocs).toBe(true)
      expect(config.indexSheets).toBe(true)
      expect(config.indexSlides).toBe(true)
      expect(config.indexFiles).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads boolean flags from env vars', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = 'folder-1'
      process.env['GOOGLE_INDEX_DOCS'] = 'false'
      process.env['GOOGLE_INDEX_FILES'] = 'false'
      const config = loadDriveConfig(dir)
      expect(config.indexDocs).toBe(false)
      expect(config.indexFiles).toBe(false)
      expect(config.indexSheets).toBe(true)
      expect(config.indexSlides).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── static fields ──────────────────────────────────────────────────────
  it('always returns id=drive and type=drive', () => {
    const dir = makeTempDir()
    try {
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = makeKeyFile(dir)
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = 'folder-1'
      const config = loadDriveConfig(dir)
      expect(config.id).toBe('drive')
      expect(config.type).toBe('drive')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── env priority over YAML ─────────────────────────────────────────────
  it('env vars take priority over YAML', () => {
    const dir = makeTempDir()
    try {
      const keyPath = makeKeyFile(dir)
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  drive:',
          `    serviceAccountKeyPath: ${keyPath}`,
          '    folderIds:',
          '      - yaml-folder',
        ].join('\n'),
      )
      process.env['GOOGLE_SERVICE_ACCOUNT_KEY'] = keyPath
      process.env['GOOGLE_DRIVE_FOLDER_IDS'] = 'env-folder'
      const config = loadDriveConfig(dir)
      expect(config.folderIds).toEqual(['env-folder'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
