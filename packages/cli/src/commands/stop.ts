import { execSync } from 'child_process'
import chalk from 'chalk'
import ora from 'ora'

export async function runStop(): Promise<void> {
  const spinner = ora('Stopping CapyTrace containers...').start()
  try {
    execSync('docker compose -f docker-compose.prod.yml down', { stdio: 'pipe' })
    spinner.succeed(chalk.green('CapyTrace stopped'))
  } catch (err) {
    spinner.fail(chalk.red('Failed to stop containers'))
    if (err instanceof Error) console.error(chalk.red(err.message))
    process.exitCode = 1
  }
}
