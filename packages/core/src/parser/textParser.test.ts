import { describe, it, expect } from 'vitest'
import { TextParser } from './textParser.js'

const parser = new TextParser()

const baseInput = {
  filename: 'test.txt',
  sourceType: 'slack' as const,
  sourceId: 'workspace-1',
  externalId: 'ext-1',
  permissions: ['user-1'],
}

describe('TextParser', () => {
  it('should parse a text buffer into a Document', async () => {
    const buffer = Buffer.from('Hello FerretSearch\nThis is the body.')
    const doc = await parser.parse({ ...baseInput, buffer })

    expect(doc.title).toBe('Hello FerretSearch')
    expect(doc.content).toContain('This is the body.')
    expect(doc.sourceType).toBe('slack')
  })

  it('should use filename as title when content is empty', async () => {
    const buffer = Buffer.from('')
    const doc = await parser.parse({ ...baseInput, buffer })

    expect(doc.title).toBe('test.txt')
  })

  it('should support .txt and .md extensions', () => {
    expect(parser.supportedExtensions).toContain('.txt')
    expect(parser.supportedExtensions).toContain('.md')
  })
})