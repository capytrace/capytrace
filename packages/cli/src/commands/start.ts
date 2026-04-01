import { execSync } from 'child_process'
import chalk from 'chalk'
import ora from 'ora'

function checkDocker(): void {
  try {
    execSync('docker --version', { stdio: 'ignore' })
  } catch {
    console.error(chalk.red('\n  Docker is not installed.'))
    console.error(chalk.gray('  Install from: https://www.docker.com/get-started'))
    process.exit(1)
  }
  try {
    execSync('docker info', { stdio: 'ignore' })
  } catch {
    console.error(chalk.red('\n  Docker daemon is not running.'))
    console.error(chalk.gray('  Please start Docker Desktop and try again.'))
    process.exit(1)
  }
}

async function waitForUrl(
  url: string,
  label: string,
  timeoutMs = 90_000,
): Promise<void> {
  const spinner = ora(`Waiting for ${label}...`).start()
  const deadline = Date.now() + timeoutMs

  while (Date.now() < deadline) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(3_000) })
      if (res.status < 500) {
        spinner.succeed(`${label} ready`)
        return
      }
    } catch {
      // keep polling
    }
    await new Promise<void>((r) => setTimeout(() => r(), 2_000))
  }

  spinner.fail(`${label} did not respond in time`)
  throw new Error(`Timeout waiting for ${label} at ${url}`)
}

function openBrowser(url: string): void {
  try {
    const cmd =
      process.platform === 'win32'
        ? 'start'
        : process.platform === 'darwin'
          ? 'open'
          : 'xdg-open'
    execSync(`${cmd} ${url}`, { stdio: 'ignore' })
  } catch {
    // non-fatal — user can open manually
  }
}

export async function runStart(options: { port: string }): Promise<void> {
  console.log(chalk.bold.cyan('\n  🦫 Starting CapyTrace...\n'))

  checkDocker()

  // Start all containers
  const composeSpinner = ora('Starting Docker services...').start()
  try {
    execSync('docker compose -f docker-compose.prod.yml up -d --build', { stdio: 'pipe' })
    composeSpinner.succeed('Docker services started')
  } catch (err) {
    composeSpinner.fail('Failed to start Docker services')
    if (err instanceof Error) console.error(chalk.red(`  ${err.message}`))
    process.exit(1)
  }

  const apiPort = options.port

  // Wait for core services
  try {
    await waitForUrl(`http://localhost:6333/healthz`, 'Qdrant')
    await waitForUrl(`http://localhost:${apiPort}/health`, 'API')
  } catch (err) {
    console.error(chalk.red(`\n  ${err instanceof Error ? err.message : String(err)}`))
    console.log(chalk.gray('  Run: capytrace logs --follow  to inspect'))
    process.exit(1)
  }

  // Pull embedding model
  const modelSpinner = ora('Pulling nomic-embed-text (first run only)...').start()
  try {
    execSync('docker compose -f docker-compose.prod.yml exec -T ollama ollama pull nomic-embed-text', {
      stdio: 'pipe',
    })
    modelSpinner.succeed('Embedding model ready')
  } catch {
    modelSpinner.warn('Could not pull model automatically')
    console.log(chalk.gray('  Run manually: docker compose exec ollama ollama pull nomic-embed-text'))
  }

  const uiPort = process.env['UI_PORT'] ?? '5173'
  const uiUrl = `http://localhost:${uiPort}`

  console.log()
  console.log(chalk.green.bold('  ✓ CapyTrace is running!'))
  console.log()
  console.log(`  ${chalk.bold('UI:')}   ${chalk.cyan(uiUrl)}`)
  console.log(`  ${chalk.bold('API:')}  ${chalk.cyan(`http://localhost:${apiPort}`)}`)
  console.log()
  console.log(chalk.gray('  Run sync:  capytrace sync'))
  console.log(chalk.gray('  Status:    capytrace status'))
  console.log(chalk.gray('  Logs:      capytrace logs --follow'))
  console.log()

  openBrowser(uiUrl)
}
