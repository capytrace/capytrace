import { randomUUID } from 'node:crypto'
import type { Document, IConnector } from '@capytrace/core'
import { GitHubClient } from './githubClient.js'
import type { GitHubConfig, GitHubFile, GitHubIssue, GitHubPR, GitHubRepo } from './types.js'

export class GitHubConnector implements IConnector {
  readonly config: GitHubConfig
  private readonly client: GitHubClient

  constructor(config: GitHubConfig) {
    this.config = config
    this.client = new GitHubClient(config.token)
  }

  async connect(): Promise<void> {
    const ok = await this.client.testConnection()
    if (!ok) {
      throw new Error(
        'GitHub connection failed: invalid or missing token. ' +
          'Verify that GITHUB_TOKEN is set and has the required scopes (repo, read:org).',
      )
    }
  }

  async *sync(): AsyncGenerator<Document> {
    for (const repoSlug of this.config.repos) {
      const [owner, repoName] = repoSlug.split('/')
      if (owner === undefined || repoName === undefined) continue

      let repoInfo: GitHubRepo
      try {
        repoInfo = await this.client.getRepo(owner, repoName)
      } catch {
        repoInfo = { fullName: repoSlug, defaultBranch: 'main', private: false, description: null }
      }

      if (this.config.indexReadme) {
        const content = await this.client.getReadme(owner, repoName)
        if (content.trim() !== '') {
          yield this.readmeToDocument(content, repoSlug, repoInfo)
        }
      }

      if (this.config.indexIssues) {
        for await (const batch of this.client.getIssues(owner, repoName)) {
          for (const issue of batch) {
            yield this.issueToDocument(issue, repoSlug, repoInfo)
          }
        }
      }

      if (this.config.indexPRs) {
        for await (const batch of this.client.getPRs(owner, repoName)) {
          for (const pr of batch) {
            yield this.prToDocument(pr, repoSlug, repoInfo)
          }
        }
      }

      if (this.config.indexWiki) {
        const wikiContent = await this.client.getWiki(owner, repoName)
        if (wikiContent !== null && wikiContent.trim() !== '') {
          yield this.wikiToDocument(wikiContent, repoSlug, repoInfo)
        }
      }

      if (this.config.indexCode) {
        for await (const batch of this.client.getFiles(
          owner,
          repoName,
          this.config.codeExtensions,
        )) {
          for (const file of batch) {
            yield this.fileToDocument(file, repoSlug, repoInfo)
          }
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // GitHub REST API is stateless — nothing to tear down
  }

  private permissions(repo: GitHubRepo): string[] {
    return repo.private ? [] : ['*']
  }

  private readmeToDocument(content: string, repoSlug: string, repo: GitHubRepo): Document {
    const doc: Document = {
      id: randomUUID(),
      stableId: `github:${repoSlug}:readme`,
      sourceType: 'github',
      sourceId: repoSlug,
      externalId: 'readme',
      title: `${repoSlug} README`,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: this.permissions(repo),
      metadata: { repo: repoSlug },
    }
    if (repo.description !== null) doc.metadata = { ...doc.metadata, description: repo.description }
    return doc
  }

  private issueToDocument(issue: GitHubIssue, repoSlug: string, repo: GitHubRepo): Document {
    const parts = [issue.body ?? '', ...issue.comments].filter(Boolean)
    const content = parts.join('\n\n---\n\n')

    const doc: Document = {
      id: randomUUID(),
      stableId: `github:${repoSlug}:issue-${issue.number}`,
      sourceType: 'github',
      sourceId: repoSlug,
      externalId: issue.number.toString(),
      title: issue.title,
      content,
      createdAt: new Date(issue.createdAt),
      updatedAt: new Date(issue.updatedAt),
      permissions: this.permissions(repo),
      metadata: {
        repo: repoSlug,
        number: issue.number,
        state: issue.state,
        labels: issue.labels,
      },
    }
    if (issue.htmlUrl !== '') doc.url = issue.htmlUrl
    if (issue.user !== null) doc.author = issue.user
    return doc
  }

  private prToDocument(pr: GitHubPR, repoSlug: string, repo: GitHubRepo): Document {
    const parts = [pr.body ?? '', ...pr.reviewComments].filter(Boolean)
    const content = parts.join('\n\n---\n\n')

    const doc: Document = {
      id: randomUUID(),
      stableId: `github:${repoSlug}:pr-${pr.number}`,
      sourceType: 'github',
      sourceId: repoSlug,
      externalId: pr.number.toString(),
      title: pr.title,
      content,
      createdAt: new Date(pr.createdAt),
      updatedAt: new Date(pr.updatedAt),
      permissions: this.permissions(repo),
      metadata: {
        repo: repoSlug,
        number: pr.number,
        state: pr.state,
        merged: pr.mergedAt !== null,
      },
    }
    if (pr.htmlUrl !== '') doc.url = pr.htmlUrl
    if (pr.user !== null) doc.author = pr.user
    return doc
  }

  private wikiToDocument(content: string, repoSlug: string, repo: GitHubRepo): Document {
    return {
      id: randomUUID(),
      stableId: `github:${repoSlug}:wiki`,
      sourceType: 'github',
      sourceId: repoSlug,
      externalId: 'wiki',
      title: `${repoSlug} Wiki`,
      content,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: this.permissions(repo),
      metadata: { repo: repoSlug },
    }
  }

  private fileToDocument(file: GitHubFile, repoSlug: string, repo: GitHubRepo): Document {
    return {
      id: randomUUID(),
      stableId: `github:${repoSlug}:file-${file.path}`,
      sourceType: 'github',
      sourceId: repoSlug,
      externalId: file.path,
      title: file.name,
      content: file.content,
      createdAt: new Date(),
      updatedAt: new Date(),
      permissions: this.permissions(repo),
      metadata: {
        repo: repoSlug,
        path: file.path,
        extension: file.extension,
      },
    }
  }
}
