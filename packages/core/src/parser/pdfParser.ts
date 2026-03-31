import { randomUUID } from 'crypto'
import { PDFParse } from 'pdf-parse'
import type { IParser, ParseInput } from './types.js'
import type { Document } from '../types.js'

export class PdfParser implements IParser {
  readonly supportedExtensions = ['.pdf']

  async parse(input: ParseInput): Promise<Document> {
    const pdf = new PDFParse({ data: input.buffer })
    const result = await pdf.getText()

    const lines = result.text.split('\n')
    const title =
      lines.find((line: string) => line.trim().length > 0)?.trim() ?? input.filename

    return {
      id: randomUUID(),
      stableId: input.stableId ?? `${input.sourceType}:${input.sourceId}:${input.externalId}`,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      externalId: input.externalId,
      title,
      content: result.text,
      permissions: input.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...input.metadata,
        filename: input.filename,
        pages: result.total,
        sizeBytes: input.buffer.length,
      },
    }
  }
}