import { indexQueue } from '@ferretsearch/core'
import type { IConnector } from '@ferretsearch/core'
import { SlackConnector, loadSlackConfig } from '@ferretsearch/connectors'

export interface ConnectorStatus {
  id: string
  type: string
  status: 'idle' | 'syncing' | 'error'
  lastSync: Date | null
  documentsIndexed: number
  error?: string
}

interface ConnectorEntry {
  connector: IConnector
  status: ConnectorStatus
  interval: ReturnType<typeof setInterval> | null
}

const log = (msg: string) => console.log(`[FerretSearch] ${msg}`)

export class Orchestrator {
  private readonly entries = new Map<string, ConnectorEntry>()

  async start(): Promise<void> {
    this.loadConnectors()

    for (const [id, entry] of this.entries) {
      try {
        await entry.connector.connect()
        log(`Connector "${id}" connected`)
      } catch (err) {
        entry.status.status = 'error'
        entry.status.error = err instanceof Error ? err.message : String(err)
        log(`Connector "${id}" failed to connect: ${entry.status.error}`)
        continue
      }

      // Initial sync (non-blocking)
      void this.runSync(id)

      // Schedule periodic sync
      const intervalMs = entry.connector.config.syncIntervalMinutes * 60 * 1000
      entry.interval = setInterval(() => {
        void this.runSync(id)
      }, intervalMs)
    }
  }

  async stop(): Promise<void> {
    for (const [id, entry] of this.entries) {
      if (entry.interval !== null) clearInterval(entry.interval)
      try {
        await entry.connector.disconnect()
      } catch (err) {
        log(`Error disconnecting "${id}": ${err instanceof Error ? err.message : String(err)}`)
      }
    }
    this.entries.clear()
  }

  getStatus(): ConnectorStatus[] {
    return Array.from(this.entries.values()).map((e) => e.status)
  }

  async triggerSync(connectorId?: string): Promise<{ queued: number; connectors: string[] }> {
    const ids =
      connectorId !== undefined
        ? [connectorId]
        : Array.from(this.entries.keys())

    let totalQueued = 0
    const triggered: string[] = []

    for (const id of ids) {
      const entry = this.entries.get(id)
      if (entry === undefined) continue
      const queued = await this.runSync(id)
      totalQueued += queued
      triggered.push(id)
    }

    return { queued: totalQueued, connectors: triggered }
  }

  private loadConnectors(): void {
    // Slack — only if token is configured
    if (process.env['SLACK_BOT_TOKEN']) {
      try {
        const config = loadSlackConfig()
        const connector = new SlackConnector(config)
        this.entries.set(config.id, {
          connector,
          status: {
            id: config.id,
            type: config.type,
            status: 'idle',
            lastSync: null,
            documentsIndexed: 0,
          },
          interval: null,
        })
      } catch (err) {
        log(`Could not load Slack config: ${err instanceof Error ? err.message : String(err)}`)
      }
    }
  }

  private async runSync(id: string): Promise<number> {
    const entry = this.entries.get(id)
    if (entry === undefined) return 0

    entry.status.status = 'syncing'
    log(`Starting initial sync for connector: ${id}`)

    let queued = 0
    try {
      for await (const doc of entry.connector.sync()) {
        await indexQueue.add('index', { document: doc })
        queued++
      }
      entry.status.status = 'idle'
      entry.status.lastSync = new Date()
      entry.status.documentsIndexed += queued
      log(`${id} sync complete — ${queued} documents queued`)
    } catch (err) {
      entry.status.status = 'error'
      entry.status.error = err instanceof Error ? err.message : String(err)
      log(`Connector "${id}" sync error: ${entry.status.error}`)
    }

    return queued
  }
}
