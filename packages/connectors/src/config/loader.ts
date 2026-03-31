import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { load as loadYaml } from 'js-yaml'
import type { SlackConfig } from '../slack/types.js'

interface YamlSlackConfig {
  botToken?: string
  channels?: string[]
  syncHistoryDays?: number
}

interface YamlGitHubConfig {
  token?: string
  repos?: string[]
  indexReadme?: boolean
  indexIssues?: boolean
  indexPRs?: boolean
  indexWiki?: boolean
  indexCode?: boolean
  codeExtensions?: string[]
  syncIntervalMinutes?: number
}

interface YamlDriveConfig {
  serviceAccountKeyPath?: string
  folderIds?: string[]
  indexDocs?: boolean
  indexSheets?: boolean
  indexSlides?: boolean
  indexFiles?: boolean
  syncIntervalMinutes?: number
}

export interface CapyTraceYaml {
  connectors?: {
    slack?: YamlSlackConfig
    github?: YamlGitHubConfig
    drive?: YamlDriveConfig
  }
}

export function readYamlConfig(projectRoot: string): CapyTraceYaml {
  const configPath = join(projectRoot, 'capytrace.config.yml')
  if (!existsSync(configPath)) return {}

  const raw = readFileSync(configPath, 'utf-8')
  const parsed = loadYaml(raw) as CapyTraceYaml | null
  return parsed ?? {}
}

export function loadSlackConfig(projectRoot?: string): SlackConfig {
  const root = projectRoot ?? process.cwd()
  const yaml = readYamlConfig(root)
  const slack = yaml.connectors?.slack ?? {}

  // Env vars have priority over YAML
  const botToken = process.env['SLACK_BOT_TOKEN'] ?? slack.botToken

  if (!botToken) {
    throw new Error(
      'Slack connector is not configured: SLACK_BOT_TOKEN environment variable is missing. ' +
        'Set it in your environment or under connectors.slack.botToken in capytrace.config.yml.',
    )
  }

  const channelsEnv = process.env['SLACK_CHANNELS']
  const channels: string[] =
    channelsEnv != null && channelsEnv.trim() !== ''
      ? channelsEnv
          .split(',')
          .map((c) => c.trim())
          .filter(Boolean)
      : (slack.channels ?? [])

  const historyEnv = process.env['SLACK_SYNC_HISTORY_DAYS']
  const syncHistoryDays =
    historyEnv != null && historyEnv.trim() !== ''
      ? parseInt(historyEnv, 10)
      : (slack.syncHistoryDays ?? 30)

  return {
    id: 'slack',
    type: 'slack',
    enabled: true,
    syncIntervalMinutes: 60,
    credentials: { botToken },
    botToken,
    channels,
    syncHistoryDays,
  }
}
