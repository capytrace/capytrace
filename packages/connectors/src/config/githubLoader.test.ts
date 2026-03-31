import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadGitHubConfig } from './githubLoader.js'

function makeTempDir(): string {
  const dir = join(tmpdir(), `capytrace-github-test-${Date.now()}`)
  mkdirSync(dir, { recursive: true })
  return dir
}

const ENV_KEYS = [
  'GITHUB_TOKEN',
  'GITHUB_REPOS',
  'GITHUB_INDEX_README',
  'GITHUB_INDEX_ISSUES',
  'GITHUB_INDEX_PRS',
  'GITHUB_INDEX_WIKI',
  'GITHUB_INDEX_CODE',
  'GITHUB_CODE_EXTENSIONS',
  'GITHUB_SYNC_INTERVAL_MINUTES',
] as const

describe('loadGitHubConfig', () => {
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
  it('throws when GITHUB_TOKEN is absent', () => {
    const dir = makeTempDir()
    try {
      expect(() => loadGitHubConfig(dir)).toThrowError(/GITHUB_TOKEN/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when GITHUB_REPOS is absent', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    const dir = makeTempDir()
    try {
      expect(() => loadGitHubConfig(dir)).toThrowError(/GITHUB_REPOS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('throws when GITHUB_REPOS is an empty string', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = '   '
    const dir = makeTempDir()
    try {
      expect(() => loadGitHubConfig(dir)).toThrowError(/GITHUB_REPOS/)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── token & repos ──────────────────────────────────────────────────────
  it('reads token and repos from env vars', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-env-token'
    process.env['GITHUB_REPOS'] = 'facebook/react, microsoft/typescript'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.token).toBe('ghp-env-token')
      expect(config.repos).toEqual(['facebook/react', 'microsoft/typescript'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── codeExtensions ─────────────────────────────────────────────────────
  it('parses GITHUB_CODE_EXTENSIONS from CSV string', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    process.env['GITHUB_CODE_EXTENSIONS'] = '.ts, .py, .go'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.codeExtensions).toEqual(['.ts', '.py', '.go'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('uses default codeExtensions when env var is absent', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.codeExtensions).toEqual(['.ts', '.js', '.py', '.go', '.java'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── boolean defaults ───────────────────────────────────────────────────
  it('defaults indexReadme, indexIssues, indexPRs, indexWiki to true', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.indexReadme).toBe(true)
      expect(config.indexIssues).toBe(true)
      expect(config.indexPRs).toBe(true)
      expect(config.indexWiki).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('defaults indexCode to false', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.indexCode).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('reads boolean flags from env vars', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    process.env['GITHUB_INDEX_README'] = 'false'
    process.env['GITHUB_INDEX_CODE'] = 'true'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.indexReadme).toBe(false)
      expect(config.indexCode).toBe(true)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── YAML fallback ──────────────────────────────────────────────────────
  it('reads config from YAML when env vars are absent', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  github:',
          '    token: ghp-yaml-token',
          '    repos:',
          '      - octocat/Hello-World',
          '    indexCode: true',
          '    codeExtensions:',
          '      - .ts',
          '      - .md',
        ].join('\n'),
      )
      const config = loadGitHubConfig(dir)
      expect(config.token).toBe('ghp-yaml-token')
      expect(config.repos).toEqual(['octocat/Hello-World'])
      expect(config.indexCode).toBe(true)
      expect(config.codeExtensions).toEqual(['.ts', '.md'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('env vars take priority over YAML', () => {
    const dir = makeTempDir()
    try {
      writeFileSync(
        join(dir, 'capytrace.config.yml'),
        [
          'connectors:',
          '  github:',
          '    token: ghp-yaml-token',
          '    repos:',
          '      - yaml/repo',
        ].join('\n'),
      )
      process.env['GITHUB_TOKEN'] = 'ghp-env-wins'
      process.env['GITHUB_REPOS'] = 'env/repo'

      const config = loadGitHubConfig(dir)
      expect(config.token).toBe('ghp-env-wins')
      expect(config.repos).toEqual(['env/repo'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  // ── static fields ──────────────────────────────────────────────────────
  it('always returns id=github and type=github', () => {
    process.env['GITHUB_TOKEN'] = 'ghp-test'
    process.env['GITHUB_REPOS'] = 'owner/repo'
    const dir = makeTempDir()
    try {
      const config = loadGitHubConfig(dir)
      expect(config.id).toBe('github')
      expect(config.type).toBe('github')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
