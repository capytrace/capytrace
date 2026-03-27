import type { Document } from '../types.js'

// Input received by every parser
export interface ParseInput {
  buffer: Buffer
  filename: string
  sourceType: Document['sourceType']
  sourceId: string
  externalId: string
  permissions: string[]
  metadata?: Record<string, unknown>
}

// Every parser must implement this interface
export interface IParser {
  readonly supportedExtensions: string[]
  parse(input: ParseInput): Promise<Document>
}