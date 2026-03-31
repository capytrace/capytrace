import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Job } from 'bullmq'
import type { IndexJobData, IndexJobResult } from './types.js'
import type { Document } from '../types.js'

// ---------------------------------------------------------------------------
// Shared state and mocks — created via vi.hoisted to be available in factories
// ---------------------------------------------------------------------------
const { state, mocks } = vi.hoisted(() => {
  const chunk = { id: 'c-1', documentId: 'doc-1', index: 0, content: 'hello world', tokenCount: 2 }
  const embeddedChunk = { ...chunk, embedding: [0.1, 0.2, 0.3] }

  return {
    state: {
      capturedProcessor: undefined as
        | ((job: Job<IndexJobData, IndexJobResult>) => Promise<IndexJobResult>)
        | undefined,
    },
    mocks: {
      chunk,
      embeddedChunk,
      chunkFn: vi.fn().mockReturnValue([chunk]),
      embedChunks: vi.fn().mockResolvedValue([embeddedChunk]),
      createCollectionIfNotExists: vi.fn().mockResolvedValue(undefined),
      deleteByStableId: vi.fn().mockResolvedValue(undefined),
      upsertChunks: vi.fn().mockResolvedValue(undefined),
    },
  }
})

// ---------------------------------------------------------------------------
// Module mocks (hoisted before all imports by Vitest)
// ---------------------------------------------------------------------------
vi.mock('bullmq', () => ({
  Worker: vi.fn(function (
    _name: string,
    processor: (job: Job<IndexJobData, IndexJobResult>) => Promise<IndexJobResult>,
  ) {
    state.capturedProcessor = processor
    return { on: vi.fn() }
  }),
  Queue: vi.fn(function () {
    return { add: vi.fn(), close: vi.fn() }
  }),
}))

vi.mock('../chunker/slidingWindowChunker.js', () => ({
  SlidingWindowChunker: vi.fn(function () {
    return { chunk: mocks.chunkFn }
  }),
}))

vi.mock('../embedder/ollamaEmbedder.js', () => ({
  OllamaEmbedder: vi.fn(function () {
    return { embedChunks: mocks.embedChunks }
  }),
}))

vi.mock('../qdrant/qdrantStore.js', () => ({
  QdrantStore: vi.fn(function () {
    return {
      createCollectionIfNotExists: mocks.createCollectionIfNotExists,
      deleteByStableId: mocks.deleteByStableId,
      upsertChunks: mocks.upsertChunks,
    }
  }),
}))

// Trigger module-level code (singleton creation + Worker instantiation)
import './indexWorker.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDocument(id = 'doc-1'): Document {
  return {
    id,
    stableId: 'filesystem:src-1:ext-1',
    sourceType: 'filesystem',
    sourceId: 'src-1',
    externalId: 'ext-1',
    title: 'Test Document',
    content: 'hello world this is content',
    permissions: ['user-1'],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    metadata: {},
  }
}

function makeJob(doc = makeDocument()): Job<IndexJobData, IndexJobResult> {
  return {
    id: 'job-1',
    data: { document: doc },
    updateProgress: vi.fn().mockResolvedValue(undefined),
  } as unknown as Job<IndexJobData, IndexJobResult>
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  mocks.chunkFn.mockReturnValue([mocks.chunk])
  mocks.embedChunks.mockResolvedValue([mocks.embeddedChunk])
  mocks.createCollectionIfNotExists.mockResolvedValue(undefined)
  mocks.deleteByStableId.mockResolvedValue(undefined)
  mocks.upsertChunks.mockResolvedValue(undefined)
})

describe('indexWorker pipeline', () => {
  it('executes all three stages in order and returns a successful result', async () => {
    const job = makeJob()

    const result = await state.capturedProcessor!(job)

    // Stage 1: collection + chunking
    expect(mocks.createCollectionIfNotExists).toHaveBeenCalledTimes(1)
    expect(mocks.chunkFn).toHaveBeenCalledWith('doc-1', 'hello world this is content')

    // Stale chunk deletion
    expect(mocks.deleteByStableId).toHaveBeenCalledTimes(1)

    // Stage 2: embedding receives raw chunks
    expect(mocks.embedChunks).toHaveBeenCalledWith([mocks.chunk])

    // Stage 3: upsert receives embedded chunks and the document
    expect(mocks.upsertChunks).toHaveBeenCalledWith([mocks.embeddedChunk], job.data.document)

    // Progress milestones
    expect(job.updateProgress).toHaveBeenCalledWith(10)
    expect(job.updateProgress).toHaveBeenCalledWith(60)
    expect(job.updateProgress).toHaveBeenCalledWith(100)

    expect(result.success).toBe(true)
    expect(result.documentId).toBe('doc-1')
  })

  it('calls deleteByStableId with document.stableId before upserting', async () => {
    const doc = makeDocument()
    const job = makeJob(doc)

    await state.capturedProcessor!(job)

    expect(mocks.deleteByStableId).toHaveBeenCalledWith(doc.stableId)

    const deleteOrder = mocks.deleteByStableId.mock.invocationCallOrder[0]!
    const upsertOrder = mocks.upsertChunks.mock.invocationCallOrder[0]!
    expect(deleteOrder).toBeLessThan(upsertOrder)
  })

  it('returns chunksIndexed matching the number of chunks produced by the embedder', async () => {
    const twoChunks = [
      { ...mocks.chunk, id: 'c-1', embedding: [0.1] },
      { ...mocks.chunk, id: 'c-2', index: 1, embedding: [0.2] },
    ]
    mocks.embedChunks.mockResolvedValue(twoChunks)

    const result = await state.capturedProcessor!(makeJob())

    expect(result.chunksIndexed).toBe(2)
    expect(result.success).toBe(true)
  })

  it('rethrows an error from the embedder without calling upsert', async () => {
    mocks.embedChunks.mockRejectedValueOnce(new Error('Ollama unavailable'))

    await expect(state.capturedProcessor!(makeJob())).rejects.toThrow('Ollama unavailable')

    expect(mocks.upsertChunks).not.toHaveBeenCalled()
  })
})
