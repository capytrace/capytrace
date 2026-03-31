import { Worker, type Job } from 'bullmq'
import type { IndexJobData, IndexJobResult } from './types.js'
import { QUEUE_NAMES } from './types.js'
import { SlidingWindowChunker } from '../chunker/slidingWindowChunker.js'
import { OllamaEmbedder } from '../embedder/ollamaEmbedder.js'
import { QdrantStore } from '../qdrant/qdrantStore.js'

const connection = {
  host: process.env['REDIS_HOST'] ?? 'localhost',
  port: Number(process.env['REDIS_PORT'] ?? 6379),
}

// Singleton instances — created once per worker process, reused across jobs
const chunker = new SlidingWindowChunker({ chunkSize: 512, chunkOverlap: 128, minChunkSize: 50 })

const ollamaUrl = process.env['OLLAMA_URL']
const embedder = new OllamaEmbedder(ollamaUrl ? { ollamaUrl } : {})

const qdrantUrl = process.env['QDRANT_URL']
const qdrantStore = new QdrantStore(qdrantUrl ? { url: qdrantUrl } : {})

async function processIndexJob(
  job: Job<IndexJobData, IndexJobResult>,
): Promise<IndexJobResult> {
  const start = Date.now()
  const { document: rawDocument } = job.data

  // BullMQ serializes via JSON — dates become strings, convert back
  const document = {
    ...rawDocument,
    createdAt: new Date(rawDocument.createdAt),
    updatedAt: new Date(rawDocument.updatedAt),
  }

  try {
    await qdrantStore.createCollectionIfNotExists()

    // Remove stale chunks from previous indexing of this document
    await qdrantStore.deleteByStableId(document.stableId)

    const chunks = chunker.chunk(document.id, document.content)
    await job.updateProgress(10)

    const embeddedChunks = await embedder.embedChunks(chunks)
    await job.updateProgress(60)

    await qdrantStore.upsertChunks(embeddedChunks, document)
    await job.updateProgress(100)

    return {
      documentId: document.id,
      chunksIndexed: embeddedChunks.length,
      durationMs: Date.now() - start,
      success: true,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`Job ${job.id} failed — ${message}`)
    throw error
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
