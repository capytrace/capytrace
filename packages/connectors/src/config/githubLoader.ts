import type { GitHubConfig } from '../github/types.js'
import { readYamlConfig } from './loader.js'

function parseBool(env: string | undefined, yamlVal: boolean | undefined, def: boolean): boolean {
  if (env !== undefined && env.trim() !== '') return env.trim().toLowerCase() === 'true'
  if (yamlVal !== undefined) return yamlVal
  return def
}

export function loadGitHubConfig(projectRoot?: string): GitHubConfig {
  const root = projectRoot ?? process.cwd()
  const yaml = readYamlConfig(root)
  const github = yaml.connectors?.github ?? {}

  const token = process.env['GITHUB_TOKEN'] ?? github.token
  if (!token) {
    throw new Error(
      'GitHub connector is not configured: GITHUB_TOKEN environment variable is missing. ' +
        'Set it in your environment or under connectors.github.token in capytrace.config.yml.',
    )
  }

  const reposEnv = process.env['GITHUB_REPOS']
  const repos: string[] =
    reposEnv != null && reposEnv.trim() !== ''
      ? reposEnv
          .split(',')
          .map((r) => r.trim())
          .filter(Boolean)
      : (github.repos ?? [])

  if (repos.length === 0) {
    throw new Error(
      'GitHub connector is not configured: GITHUB_REPOS is missing or empty. ' +
        'Set it in your environment or under connectors.github.repos in capytrace.config.yml.',
    )
  }

  const indexReadme = parseBool(process.env['GITHUB_INDEX_README'], github.indexReadme, true)
  const indexIssues = parseBool(process.env['GITHUB_INDEX_ISSUES'], github.indexIssues, true)
  const indexPRs = parseBool(process.env['GITHUB_INDEX_PRS'], github.indexPRs, true)
  const indexWiki = parseBool(process.env['GITHUB_INDEX_WIKI'], github.indexWiki, true)
  const indexCode = parseBool(process.env['GITHUB_INDEX_CODE'], github.indexCode, false)

  const codeExtEnv = process.env['GITHUB_CODE_EXTENSIONS']
  const codeExtensions: string[] =
    codeExtEnv != null && codeExtEnv.trim() !== ''
      ? codeExtEnv
          .split(',')
          .map((e) => e.trim())
          .filter(Boolean)
      : (github.codeExtensions ?? ['.ts', '.js', '.py', '.go', '.java'])

  const intervalEnv = process.env['GITHUB_SYNC_INTERVAL_MINUTES']
  const syncIntervalMinutes =
    intervalEnv != null && intervalEnv.trim() !== ''
      ? parseInt(intervalEnv, 10)
      : (github.syncIntervalMinutes ?? 60)

  return {
    id: 'github',
    type: 'github',
    enabled: true,
    syncIntervalMinutes,
    credentials: { token },
    token,
    repos,
    indexReadme,
    indexIssues,
    indexPRs,
    indexWiki,
    indexCode,
    codeExtensions,
  }
}
