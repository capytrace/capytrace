import chalk from 'chalk'
import ora from 'ora'

interface SyncResponse {
  queued: number
  connectors: string[]
}

export async function runSync(options: { port: string }): Promise<void> {
  const apiPort = options.port
  const spinner = ora('Triggering sync across all connectors...').start()

  try {
    const res = await fetch(`http://localhost:${apiPort}/sync`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
      signal: AbortSignal.timeout(30_000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)

    const data = (await res.json()) as SyncResponse
    const connectorList = data.connectors.length > 0 ? data.connectors.join(', ') : 'none'
    spinner.succeed(
      `Queued ${chalk.bold(data.queued)} document${data.queued !== 1 ? 's' : ''} — connectors: ${chalk.cyan(connectorList)}`,
    )
  } catch (err) {
    spinner.fail(chalk.red('Sync failed'))
    if (err instanceof Error) {
      console.error(chalk.gray(`  ${err.message}`))
    }
    console.log(chalk.gray(`  Is the API running at http://localhost:${apiPort}?`))
    process.exitCode = 1
  }
}
