import { Worker, type Job } from 'bullmq'
import type { IndexJobData, IndexJobResult } from './types.js'
import { QUEUE_NAMES } from './types.js'

const connection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
}

// Processor function — will be filled in Sprint 2 Task 2 with real logic
async function processIndexJob(
  job: Job<IndexJobData, IndexJobResult>,
): Promise<IndexJobResult> {
  const start = Date.now()
  const { document } = job.data

  // Update job progress
  await job.updateProgress(10)
  console.log(`Processing document: ${document.id} from ${document.sourceType}`)

  // Placeholder — parser and embedder will plug in here
  await job.updateProgress(100)

  return {
    documentId: document.id,
    chunksIndexed: 0,
    durationMs: Date.now() - start,
    success: true,
  }
}

export const indexWorker = new Worker<IndexJobData, IndexJobResult>(
  QUEUE_NAMES.INDEXING,
  processIndexJob,
  {
    connection,
    concurrency: Number(process.env['WORKER_CONCURRENCY'] ?? 5),
  },
)

// Event listeners for observability
indexWorker.on('completed', (job, result) => {
  console.log(`Job ${job.id} completed — ${result.chunksIndexed} chunks indexed`)
})

indexWorker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed — ${error.message}`)
})