import { Command } from 'commander'
import { runInit } from './commands/init.js'
import { runStart } from './commands/start.js'
import { runStop } from './commands/stop.js'
import { runSync } from './commands/sync.js'
import { runStatus } from './commands/status.js'
import { runLogs } from './commands/logs.js'

export const program = new Command()

program
  .name('capytrace')
  .description('🦫 Corporate knowledge search engine — self-hosted, open source, semantic')
  .version('0.1.0')

program
  .command('init')
  .description('Interactive setup wizard — generate .env and docker-compose.yml')
  .action(async () => {
    await runInit()
  })

program
  .command('start')
  .description('Start CapyTrace with Docker Compose (production mode)')
  .option('-p, --port <port>', 'API port', '3000')
  .action(async (opts: { port: string }) => {
    await runStart(opts)
  })

program
  .command('stop')
  .description('Stop all CapyTrace containers')
  .action(async () => {
    await runStop()
  })

program
  .command('sync')
  .description('Trigger a manual sync across all configured connectors')
  .option('-p, --port <port>', 'API port', '3000')
  .action(async (opts: { port: string }) => {
    await runSync(opts)
  })

program
  .command('status')
  .description('Show service and connector status')
  .option('-p, --port <port>', 'API port', '3000')
  .action(async (opts: { port: string }) => {
    await runStatus(opts)
  })

program
  .command('logs')
  .description('Show application logs from Docker')
  .option('-f, --follow', 'Follow log output', false)
  .option('-s, --service <service>', 'Show logs for a specific service (app, ui, redis, …)')
  .action(async (opts: { follow: boolean; service?: string }) => {
    await runLogs(opts)
  })
