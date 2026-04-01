import chalk from 'chalk'
import ora from 'ora'

interface HealthResponse {
  status: 'ok' | 'degraded'
  services: { redis: boolean; qdrant: boolean; ollama: boolean }
}

interface ConnectorStatus {
  name: string
  status: string
  lastSync: string
  documentsIndexed: number
}

interface SourcesResponse {
  connectors: ConnectorStatus[]
}

function dot(ok: boolean): string {
  return ok ? chalk.green('●') : chalk.red('●')
}

function padRight(s: string, n: number): string {
  return s.padEnd(n)
}

export async function runStatus(options: { port: string }): Promise<void> {
  const apiPort = options.port
  const baseUrl = `http://localhost:${apiPort}`

  const spinner = ora('Fetching status...').start()

  let health: HealthResponse
  let sources: SourcesResponse = { connectors: [] }

  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(5_000) })
    health = (await res.json()) as HealthResponse
  } catch {
    spinner.fail(chalk.red(`API not reachable at ${baseUrl}`))
    console.log(chalk.gray('  Run: capytrace start'))
    process.exitCode = 1
    return
  }

  try {
    const res = await fetch(`${baseUrl}/sources`, { signal: AbortSignal.timeout(5_000) })
    sources = (await res.json()) as SourcesResponse
  } catch {
    // non-fatal
  }

  spinner.stop()

  console.log()
  console.log(chalk.bold('  🦫 CapyTrace Status'))
  console.log()

  // Services table
  console.log(chalk.bold('  Infrastructure'))
  const overallOk = health.status === 'ok'
  console.log(`  ${dot(health.services.redis)}  ${padRight('Redis', 12)} ${health.services.redis ? chalk.green('ok') : chalk.red('unreachable')}`)
  console.log(`  ${dot(health.services.qdrant)}  ${padRight('Qdrant', 12)} ${health.services.qdrant ? chalk.green('ok') : chalk.red('unreachable')}`)
  console.log(`  ${dot(health.services.ollama)}  ${padRight('Ollama', 12)} ${health.services.ollama ? chalk.green('ok') : chalk.red('unreachable')}`)
  console.log()
  console.log(
    `  Overall: ${overallOk ? chalk.green.bold('healthy') : chalk.yellow.bold('degraded')}`,
  )

  // Connectors table
  console.log()
  if (sources.connectors.length > 0) {
    console.log(chalk.bold('  Connectors'))
    for (const c of sources.connectors) {
      const isActive = c.status === 'active' || c.status === 'idle'
      console.log(
        `  ${dot(isActive)}  ${padRight(c.name, 14)}${padRight(c.status, 10)}  ` +
          `${String(c.documentsIndexed).padStart(6)} docs  ` +
          `last sync: ${chalk.gray(c.lastSync)}`,
      )
    }
  } else {
    console.log(chalk.gray('  No connectors configured. Edit .env and restart.'))
  }

  console.log()
}
