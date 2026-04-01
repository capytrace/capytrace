import { spawn } from 'child_process'
import chalk from 'chalk'

export async function runLogs(options: { follow: boolean; service?: string }): Promise<void> {
  console.log(chalk.gray('\n  Streaming CapyTrace logs (Ctrl+C to exit)\n'))

  const args = ['compose', '-f', 'docker-compose.prod.yml', 'logs']
  if (options.follow) args.push('--follow')
  if (options.service !== undefined) args.push(options.service)

  const child = spawn('docker', args, { stdio: 'inherit' })

  child.on('error', (err) => {
    console.error(chalk.red(`\nFailed to stream logs: ${err.message}`))
    process.exitCode = 1
  })

  await new Promise<void>((resolve) => child.on('close', () => resolve()))
}
