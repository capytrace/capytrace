import { randomUUID } from 'crypto'
import * as pdfParse from 'pdf-parse'
import type { IParser, ParseInput } from './types.js'
import type { Document } from '../types.js'

interface PdfParseResult {
  text: string
  numpages: number
  info: Record<string, unknown>
}

type PdfParseFn = (buffer: Buffer) => Promise<PdfParseResult>

const parse = ((pdfParse as unknown as { default: PdfParseFn }).default ?? pdfParse) as PdfParseFn

export class PdfParser implements IParser {
  readonly supportedExtensions = ['.pdf']

  async parse(input: ParseInput): Promise<Document> {
    const data = await parse(input.buffer)

    const lines = data.text.split('\n')
    const title =
      lines.find((line: string) => line.trim().length > 0)?.trim() ?? input.filename

    return {
      id: randomUUID(),
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      externalId: input.externalId,
      title,
      content: data.text,
      permissions: input.permissions,
      createdAt: new Date(),
      updatedAt: new Date(),
      metadata: {
        ...input.metadata,
        filename: input.filename,
        pages: data.numpages,
        sizeBytes: input.buffer.length,
        pdfInfo: data.info,
      },
    }
  }
}