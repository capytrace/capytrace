import { describe, it, expect, vi } from 'vitest'
import type { Document } from '../types.js'
import type { IndexJobData } from './types.js'

// Mock BullMQ with proper class constructors
vi.mock('bullmq', () => {
  const Queue = vi.fn(function () {
    return {
      add: vi.fn().mockResolvedValue({ id: 'job-1' }),
      close: vi.fn().mockResolvedValue(undefined),
    }
  })

  const Worker = vi.fn(function () {
    return {
      on: vi.fn(),
      close: vi.fn().mockResolvedValue(undefined),
    }
  })

  return { Queue, Worker }
})

import { indexQueue } from './indexQueue.js'

const mockDocument: Document = {
  id: 'doc-1',
  stableId: 'slack:workspace-1:ext-1',
  sourceType: 'slack',
  sourceId: 'workspace-1',
  externalId: 'ext-1',
  title: 'Test document',
  content: 'Hello world',
  createdAt: new Date(),
  updatedAt: new Date(),
  permissions: ['user-1'],
  metadata: {},
}

describe('indexQueue', () => {
  it('should add a job to the queue', async () => {
    const jobData: IndexJobData = { document: mockDocument, priority: 1 }
    const job = await indexQueue.add('index', jobData)
    expect(job.id).toBe('job-1')
  })
})