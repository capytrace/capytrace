import { randomUUID } from 'crypto'
import * as mammoth from 'mammoth'
import type { IParser, ParseInput } from './types.js'
import type { Document } from '../types.js'

export class DocxParser implements IParser {
  readonly supportedExtensions = ['.docx']

  async parse(input: ParseInput): Promise<Document> {
    const result = await mammoth.extractRawText({ buffer: input.buffer })
    const content = result.value

    const lines = content.split('\n')
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
        sizeBytes: input.buffer.length,
        warnings: result.messages,
      },
    }
  }
}