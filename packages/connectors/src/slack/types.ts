import type { ConnectorConfig } from '@capytrace/core'

export interface SlackConfig extends ConnectorConfig {
  type: 'slack'
  channels: string[]
  syncHistoryDays: number
  botToken: string
}

export interface SlackReaction {
  name: string
  count: number
  users: string[]
}

export interface SlackFile {
  id: string
  name: string
  filetype: string
  url_private_download: string
  size: number
  mimetype: string
}

export interface SlackMessage {
  ts: string
  text: string
  user?: string
  thread_ts?: string
  files?: SlackFile[]
  reactions?: SlackReaction[]
  type: string
}

export interface SlackChannel {
  id: string
  name: string
  is_private: boolean
  num_members?: number
}
