import { describe, it, expect } from 'vitest'
import { getParser } from './index.js'
import { TextParser } from './textParser.js'
import { PdfParser } from './pdfParser.js'
import { DocxParser } from './docxParser.ts'

describe('getParser', () => {
  it('should return TextParser for .txt', () => {
    expect(getParser('file.txt')).toBeInstanceOf(TextParser)
  })

  it('should return TextParser for .md', () => {
    expect(getParser('readme.md')).toBeInstanceOf(TextParser)
  })

  it('should return PdfParser for .pdf', () => {
    expect(getParser('doc.pdf')).toBeInstanceOf(PdfParser)
  })

  it('should return DocxParser for .docx', () => {
    expect(getParser('report.docx')).toBeInstanceOf(DocxParser)
  })

  it('should throw for unsupported extension', () => {
    expect(() => getParser('image.png')).toThrow('No parser found for extension: .png')
  })
})