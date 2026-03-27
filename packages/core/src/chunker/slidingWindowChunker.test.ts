import { describe, it, expect } from 'vitest'
import { SlidingWindowChunker } from './slidingWindowChunker.js'

const DOC_ID = 'doc-001'

describe('SlidingWindowChunker', () => {
  it('generates multiple chunks with correct overlap', () => {
    // 10 words, chunkSize=4, overlap=2, step=2 → starts at 0,2,4,6,8
    // slice(0,4)=4w, slice(2,6)=4w, slice(4,8)=4w, slice(6,10)=4w, slice(8,12)=2w
    // minChunkSize=1 so all 5 are kept
    const chunker = new SlidingWindowChunker({ chunkSize: 4, chunkOverlap: 2, minChunkSize: 1 })
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j']
    const chunks = chunker.chunk(DOC_ID, words.join(' '))

    expect(chunks.length).toBe(5)

    // Verify overlap: chunk[0] ends with 'c d', chunk[1] starts with 'c d'
    const w0 = chunks[0].content.split(' ')
    const w1 = chunks[1].content.split(' ')
    expect(w0.slice(-2)).toEqual(w1.slice(0, 2))

    // All chunks reference the same document
    expect(chunks.every((c) => c.documentId === DOC_ID)).toBe(true)

    // Indices are sequential starting from 0
    chunks.forEach((c, i) => expect(c.index).toBe(i))
  })

  it('returns a single chunk when content fits within chunkSize', () => {
    const chunker = new SlidingWindowChunker({ chunkSize: 100, chunkOverlap: 10, minChunkSize: 1 })
    const content = 'hello world this is a short document'
    const chunks = chunker.chunk(DOC_ID, content)

    expect(chunks.length).toBe(1)
    expect(chunks[0].content).toBe(content)
    expect(chunks[0].index).toBe(0)
  })

  it('returns an empty array for empty content', () => {
    const chunker = new SlidingWindowChunker({ chunkSize: 50, chunkOverlap: 5, minChunkSize: 1 })
    expect(chunker.chunk(DOC_ID, '')).toEqual([])
    expect(chunker.chunk(DOC_ID, '   ')).toEqual([])
    expect(chunker.chunk(DOC_ID, '\n\t\n')).toEqual([])
  })

  it('discards trailing chunks smaller than minChunkSize', () => {
    // 7 words, chunkSize=4, overlap=2, step=2 → starts at 0,2,4,6
    // slice(4,8)=3w ('e f g'), slice(6,10)=1w ('g') — minChunkSize=3 keeps 3w chunk, drops 1w chunk
    const chunker = new SlidingWindowChunker({ chunkSize: 4, chunkOverlap: 2, minChunkSize: 3 })
    const words = ['a', 'b', 'c', 'd', 'e', 'f', 'g']
    const chunks = chunker.chunk(DOC_ID, words.join(' '))

    // Only chunks with >= 3 words should remain
    expect(chunks.every((c) => c.tokenCount >= 3)).toBe(true)
    // The last kept chunk should not contain only 'g'
    expect(chunks[chunks.length - 1].content).not.toBe('g')
  })

  it('fills tokenCount with the word count of the chunk', () => {
    const chunker = new SlidingWindowChunker({ chunkSize: 5, chunkOverlap: 1, minChunkSize: 1 })
    const content = 'one two three four five six seven eight nine ten'
    const chunks = chunker.chunk(DOC_ID, content)

    for (const chunk of chunks) {
      const wordCount = chunk.content.split(' ').length
      expect(chunk.tokenCount).toBe(wordCount)
    }
  })

  it('assigns a unique UUID to each chunk id', () => {
    const chunker = new SlidingWindowChunker({ chunkSize: 3, chunkOverlap: 1, minChunkSize: 1 })
    const content = 'a b c d e f g h i'
    const chunks = chunker.chunk(DOC_ID, content)

    const ids = chunks.map((c) => c.id)
    const uniqueIds = new Set(ids)
    expect(uniqueIds.size).toBe(ids.length)
    // Rough UUID v4 format check
    ids.forEach((id) => expect(id).toMatch(/^[0-9a-f-]{36}$/))
  })

  it('throws when chunkOverlap >= chunkSize', () => {
    expect(() => new SlidingWindowChunker({ chunkSize: 5, chunkOverlap: 5, minChunkSize: 1 })).toThrow()
    expect(() => new SlidingWindowChunker({ chunkSize: 5, chunkOverlap: 6, minChunkSize: 1 })).toThrow()
  })
})
