#!/usr/bin/env node
import { program } from '../index.js'

try {
  await program.parseAsync(process.argv)
} catch (err) {
  // Graceful Ctrl+C handling from @inquirer/prompts
  if (err instanceof Error && err.name === 'ExitPromptError') {
    console.log('\n  Aborted.')
    process.exit(0)
  }
  console.error(err)
  process.exit(1)
}
