import { describe, it, expect, vi, beforeEach } from 'vitest'
import { QdrantStore } from './qdrantStore.js'
import type { Chunk, Document } from '../types.js'

// ---------------------------------------------------------------------------
// Mock the Qdrant SDK client
// ---------------------------------------------------------------------------
const { mockCollectionExists, mockCreateCollection, mockUpsert, mockDelete } = vi.hoisted(() => ({
  mockCollectionExists: vi.fn(),
  mockCreateCollection: vi.fn(),
  mockUpsert: vi.fn(),
  mockDelete: vi.fn(),
}))

vi.mock('@qdrant/js-client-rest', () => ({
  QdrantClient: class {
    collectionExists = mockCollectionExists
    createCollection = mockCreateCollection
    upsert = mockUpsert
    delete = mockDelete
  },
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeDocument(id = 'doc-001'): Document {
  return {
    id,
    stableId: 'filesystem:src-1:ext-1',
    sourceType: 'filesystem',
    sourceId: 'src-1',
    externalId: 'ext-1',
    title: 'Test Doc',
    content: 'hello world',
    permissions: ['user-1'],
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    metadata: {},
  }
}

function makeChunk(id: string, index: number, embedding?: number[]): Chunk {
  return {
    id,
    documentId: 'doc-001',
    index,
    content: `chunk ${index}`,
    tokenCount: 2,
    ...(embedding !== undefined ? { embedding } : {}),
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
beforeEach(() => {
  vi.clearAllMocks()
  mockCollectionExists.mockResolvedValue({ exists: false })
  mockCreateCollection.mockResolvedValue({})
  mockUpsert.mockResolvedValue({})
  mockDelete.mockResolvedValue({})
})

describe('QdrantStore', () => {
  describe('createCollectionIfNotExists', () => {
    it('creates the collection when it does not exist', async () => {
      mockCollectionExists.mockResolvedValue({ exists: false })

      await new QdrantStore().createCollectionIfNotExists()

      expect(mockCreateCollection).toHaveBeenCalledTimes(1)
      expect(mockCreateCollection).toHaveBeenCalledWith(
        'capytrace',
        expect.objectContaining({
          vectors: { dense: { size: 768, distance: 'Cosine' } },
          sparse_vectors: { sparse: {} },
        }),
      )
    })

    it('does not recreate the collection when it already exists', async () => {
      mockCollectionExists.mockResolvedValue({ exists: true })

      await new QdrantStore().createCollectionIfNotExists()

      expect(mockCreateCollection).not.toHaveBeenCalled()
    })
  })

  describe('upsertChunks', () => {
    it('calls upsert with correct points and payload', async () => {
      const doc = makeDocument()
      const chunks = [
        makeChunk('chunk-0', 0, [0.1, 0.2]),
        makeChunk('chunk-1', 1, [0.3, 0.4]),
      ]

      await new QdrantStore().upsertChunks(chunks, doc)

      expect(mockUpsert).toHaveBeenCalledTimes(1)
      const [collectionName, args] = mockUpsert.mock.calls[0] as [string, { points: unknown[] }]
      expect(collectionName).toBe('capytrace')
      expect(args.points).toHaveLength(2)
      expect(args.points[0]).toMatchObject({
        id: 'chunk-0',
        vector: { dense: [0.1, 0.2] },
        payload: {
          documentId: 'doc-001',
          stableId: 'filesystem:src-1:ext-1',
          sourceType: 'filesystem',
          sourceId: 'src-1',
          content: 'chunk 0',
          permissions: ['user-1'],
          chunkIndex: 0,
          createdAt: '2024-01-01T00:00:00.000Z',
        },
      })
    })

    it('processes chunks in batches of 100', async () => {
      const doc = makeDocument()
      const chunks = Array.from({ length: 150 }, (_, i) =>
        makeChunk(`chunk-${i}`, i, [i * 0.01]),
      )

      await new QdrantStore().upsertChunks(chunks, doc)

      expect(mockUpsert).toHaveBeenCalledTimes(2)
      const [, firstArgs] = mockUpsert.mock.calls[0] as [string, { points: unknown[] }]
      const [, secondArgs] = mockUpsert.mock.calls[1] as [string, { points: unknown[] }]
      expect(firstArgs.points).toHaveLength(100)
      expect(secondArgs.points).toHaveLength(50)
    })

    it('throws a descriptive error when a chunk has no embedding', async () => {
      const doc = makeDocument()
      const chunks = [makeChunk('chunk-missing', 0)]

      await expect(new QdrantStore().upsertChunks(chunks, doc)).rejects.toThrow(
        'chunk-missing is missing embedding',
      )
      expect(mockUpsert).not.toHaveBeenCalled()
    })

    it('does not call upsert when given an empty array', async () => {
      await new QdrantStore().upsertChunks([], makeDocument())

      expect(mockUpsert).not.toHaveBeenCalled()
    })
  })

  describe('deleteByStableId', () => {
    it('deletes points using a payload filter on stableId', async () => {
      await new QdrantStore().deleteByStableId('stable-id-123')

      expect(mockDelete).toHaveBeenCalledTimes(1)
      const [collectionName, args] = mockDelete.mock.calls[0] as [
        string,
        { filter: { must: { key: string; match: { value: string } }[] } },
      ]
      expect(collectionName).toBe('capytrace')
      expect(args.filter).toMatchObject({
        must: [{ key: 'stableId', match: { value: 'stable-id-123' } }],
      })
    })
  })
})
