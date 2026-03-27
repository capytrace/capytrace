import { TextParser } from './textParser.js'
import { PdfParser } from './pdfParser.js'
import { DocxParser } from './docxParser.ts'
import type { IParser } from './types.js'

export * from './types.js'
export * from './textParser.js'
export * from './pdfParser.js'
export * from './docxParser.ts'

const parsers: IParser[] = [
  new TextParser(),
  new PdfParser(),
  new DocxParser(),
]

// Returns the correct parser based on file extension
export function getParser(filename: string): IParser {
  const ext = '.' + filename.split('.').pop()?.toLowerCase()
  const parser = parsers.find((p) => p.supportedExtensions.includes(ext))

  if (parser === undefined) {
    throw new Error(`No parser found for extension: ${ext}`)
  }

  return parser
}