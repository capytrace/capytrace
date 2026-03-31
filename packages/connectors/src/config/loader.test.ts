import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadSlackConfig } from './loader.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `capytrace-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

describe('loadSlackConfig', () => {
  let originalEnv: Record<string, string | undefined>

  beforeEach(() => {
    originalEnv = {
      SLACK_BOT_TOKEN: process.env['SLACK_BOT_TOKEN'],
      SLACK_CHANNELS: process.env['SLACK_CHANNELS'],
      SLACK_SYNC_HISTORY_DAYS: process.env['SLACK_SYNC_HISTORY_DAYS'],
    }
    delete process.env['SLACK_BOT_TOKEN']
    delete process.env['SLACK_CHANNELS']
    delete process.env['SLACK_SYNC_HISTORY_DAYS']
  })

  afterEach(() => {
    for (const [key, value] of Object.entries(originalEnv)) {
      if (value === undefined) {
        delete process.env[key]
      } else {
        process.env[key] = value
      }
    }
    vi.restoreAllMocks()
  })

  it('throws when SLACK_BOT_TOKEN is absent and no YAML config', () => {
    const dir = makeTempDir()
    try {
      expect(() => loadSlackConfig(dir)).toThrowError(/SLACK_BOT_TOKEN/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads bot token from environment variable', () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-env-token'
    const dir = makeTempDir()
    try {
      const config = loadSlackConfig(dir)
      expect(config.botToken).toBe('xoxb-env-token')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads channels from SLACK_CHANNELS env var (comma-separated)', () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-token'
    process.env['SLACK_CHANNELS'] = 'C001, C002, C003'
    const dir = makeTempDir()
    try {
      const config = loadSlackConfig(dir)
      expect(config.channels).toEqual(['C001', 'C002', 'C003'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads syncHistoryDays from SLACK_SYNC_HISTORY_DAYS env var', () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-token'
    process.env['SLACK_SYNC_HISTORY_DAYS'] = '14'
    const dir = makeTempDir()
    try {
      const config = loadSlackConfig(dir)
      expect(config.syncHistoryDays).toBe(14)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses default syncHistoryDays of 30 when env var is absent', () => {
    process.env['SLACK_BOT_TOKEN'] = 'xoxb-token'
    const dir = makeTempDir()
    try {
      const config = loadSlackConfig(dir)
      expect(config.syncHistoryDays).toBe(30)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads config from YAML when env vars are absent', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  slack:',
          '    botToken: xoxb-yaml-token',
          '    channels:',
          '      - C100',
          '      - C200',
          '    syncHistoryDays: 7',
        ].join('\n'),
      )
      const config = loadSlackConfig(dir)
      expect(config.botToken).toBe('xoxb-yaml-token')
      expect(config.channels).toEqual(['C100', 'C200'])
      expect(config.syncHistoryDays).toBe(7)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('env vars take priority over YAML config', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  slack:',
          '    botToken: xoxb-yaml-token',
          '    channels:',
          '      - C-yaml',
          '    syncHistoryDays: 7',
        ].join('\n'),
      )
      process.env['SLACK_BOT_TOKEN'] = 'xoxb-env-wins'
      process.env['SLACK_CHANNELS'] = 'C-env'
      process.env['SLACK_SYNC_HISTORY_DAYS'] = '90'

      const config = loadSlackConfig(dir)
      expect(config.botToken).toBe('xoxb-env-wins')
      expect(config.channels).toEqual(['C-env'])
      expect(config.syncHistoryDays).toBe(90)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
