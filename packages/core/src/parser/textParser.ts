import { randomUUID } from 'crypto'
import type { IParser, ParseInput } from './types.js'
import type { Document } from '../types.js'

export class TextParser implements IParser {
  readonly supportedExtensions = ['.txt', '.md']

  async parse(input: ParseInput): Promise<Document> {
    const content = input.buffer.toString('utf-8')
    const lines = content.split('\n')

    // Use first non-empty line as title
    const title =
      lines.find((line) => line.trim().length > 0)?.trim() ?? input.filename

    return {
      id: randomUUID(),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      externalId: input.externalId,
      title,
      content,
      permissions: input.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...input.metadata,
        filename: input.filename,
        extension: input.filename.split('.').pop(),
        sizeBytes: input.buffer.length,
      },
    }
  }
}