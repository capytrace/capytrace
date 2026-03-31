import type { ConnectorConfig } from '@capytrace/core'

export interface GitHubConfig extends ConnectorConfig {
  type: 'github'
  token: string
  repos: string[]
  indexReadme: boolean
  indexIssues: boolean
  indexPRs: boolean
  indexWiki: boolean
  indexCode: boolean
  codeExtensions: string[]
}

export interface GitHubRepo {
  fullName: string
  defaultBranch: string
  private: boolean
  description: string | null
}

export interface GitHubIssue {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed'
  htmlUrl: string
  user: string | null
  createdAt: string
  updatedAt: string
  labels: string[]
  comments: string[]
}

export interface GitHubPR {
  id: number
  number: number
  title: string
  body: string | null
  state: 'open' | 'closed' | 'merged'
  htmlUrl: string
  user: string | null
  createdAt: string
  updatedAt: string
  mergedAt: string | null
  labels: string[]
  baseBranch: string
  headBranch: string
  reviewComments: string[]
}

export interface GitHubFile {
  path: string
  name: string
  content: string
  extension: string
  sha: string
}
