import { randomUUID } from 'node:crypto'
import type { Document, IConnector } from '@capytrace/core'
import { getParser } from '@capytrace/core'
import { SlackClient } from './slackClient.js'
import { FileDownloader } from './fileDownloader.js'
import type { SlackConfig, SlackMessage } from './types.js'

export class SlackConnector implements IConnector {
  readonly config: SlackConfig
  private client: SlackClient
  private fileDownloader: FileDownloader

  constructor(config: SlackConfig) {
    this.config = config
    this.client = new SlackClient(config.botToken)
    this.fileDownloader = new FileDownloader()
  }

  async connect(): Promise<void> {
    const ok = await this.client.testConnection()
    if (!ok) {
      throw new Error(
        'Slack connection failed: invalid or missing bot token. ' +
          'Verify that SLACK_BOT_TOKEN is set and the token has the required scopes ' +
          '(channels:history, channels:read).',
      )
    }
  }

  async *sync(): AsyncGenerator<Document> {
    const channels = await this.client.getChannels(this.config.channels)
    const oldestTs = this.computeOldestTs(this.config.syncHistoryDays)

    for (const channel of channels) {
      for await (const batch of this.client.getMessages(channel.id, oldestTs)) {
        for (const message of batch) {
          const hasText = message.text.trim() !== ''
          const hasFiles = (message.files?.length ?? 0) > 0

          if (!hasText && !hasFiles) continue

          if (hasText) {
            yield this.messageToDocument(message, channel.id, channel.name)
          }

          if (hasFiles) {
            for (const file of message.files!) {
              try {
                const buffer = await this.fileDownloader.downloadFile(
                  file,
                  this.config.botToken,
                )
                const fileDoc = await getParser(file.name).parse({
                  buffer,
                  filename: file.name,
                  sourceType: 'slack',
                  sourceId: channel.id,
                  externalId: file.id,
                  permissions: ['*'],
                  stableId: `slack:${channel.id}:file-${file.id}`,
                  metadata: {
                    channelId: channel.id,
                    messageTs: message.ts,
                    fileType: file.filetype,
                  },
                })
                fileDoc.title = file.name
                fileDoc.url = file.url_private_download
                yield fileDoc
              } catch (err) {
                console.error(
                  `[SlackConnector] Failed to process file "${file.name}" from message ${message.ts}:`,
                  err,
                )
              }
            }
          }
        }
      }
    }
  }

  async disconnect(): Promise<void> {
    // Slack API is stateless — nothing to tear down
  }

  private computeOldestTs(historyDays: number): string {
    const ms = Date.now() - historyDays * 24 * 60 * 60 * 1000
    return (ms / 1000).toFixed(6)
  }

  private messageToDocument(
    message: SlackMessage,
    channelId: string,
    channelName: string,
  ): Document {
    const title = message.text.slice(0, 80)
    const tsSeconds = parseFloat(message.ts)
    const createdAt = isNaN(tsSeconds) ? new Date() : new Date(tsSeconds * 1000)

    const doc: Document = {
      id: randomUUID(),
      stableId: `slack:${channelId}:${message.ts}`,
      sourceType: 'slack',
      sourceId: channelId,
      externalId: message.ts,
      title,
      content: message.text,
      createdAt,
      updatedAt: createdAt,
      permissions: ['*'],
      metadata: {
        channelId,
        channelName,
        threadTs: message.thread_ts ?? null,
        reactions: message.reactions ?? [],
      },
    }
    if (message.user !== undefined) doc.author = message.user
    return doc
  }

}
