import { describe, it, expect } from 'vitest'
import { loadPlugin, validatePlugin } from './pluginLoader.js'
import { validateConfig } from './configValidator.js'
import type { PluginManifest } from './types.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function makeImportFn(result: unknown) {
  return () => Promise.resolve(result)
}

function makeFailingImportFn(message: string) {
  return () => Promise.reject(new Error(message))
}

const validPlugin = {
  manifest: {
    name: 'test-connector',
    version: '1.0.0',
    description: 'Test plugin',
    author: 'Tester',
    sourceType: 'filesystem',
    configSchema: {},
  },
  createConnector: () => ({}),
}

// ---------------------------------------------------------------------------
// loadPlugin
// ---------------------------------------------------------------------------
describe('loadPlugin', () => {
  it('throws when module does not exist', async () => {
    await expect(
      loadPlugin('./nonexistent.js', makeFailingImportFn('Cannot find module')),
    ).rejects.toThrow('Cannot find module')
  })

  it('throws descriptive error when manifest is missing', async () => {
    await expect(
      loadPlugin('./test.js', makeImportFn({ createConnector: () => {} })),
    ).rejects.toThrow(/manifest/)
  })

  it('throws descriptive error when createConnector is missing', async () => {
    await expect(
      loadPlugin('./test.js', makeImportFn({ manifest: validPlugin.manifest })),
    ).rejects.toThrow(/createConnector/)
  })

  it('returns the plugin when both manifest and createConnector are present', async () => {
    const plugin = await loadPlugin('./test.js', makeImportFn(validPlugin))
    expect(plugin.manifest.name).toBe('test-connector')
    expect(typeof plugin.createConnector).toBe('function')
  })
})

// ---------------------------------------------------------------------------
// validatePlugin
// ---------------------------------------------------------------------------
describe('validatePlugin', () => {
  it('returns false for null', () => {
    expect(validatePlugin(null)).toBe(false)
  })

  it('returns false for non-object', () => {
    expect(validatePlugin('a string')).toBe(false)
  })

  it('returns false for object without manifest', () => {
    expect(validatePlugin({ createConnector: () => {} })).toBe(false)
  })

  it('returns false for object without createConnector', () => {
    expect(validatePlugin({ manifest: validPlugin.manifest })).toBe(false)
  })

  it('returns true for a valid plugin', () => {
    expect(validatePlugin(validPlugin)).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// validateConfig
// ---------------------------------------------------------------------------
describe('validateConfig', () => {
  const schema: PluginManifest['configSchema'] = {
    apiKey: { type: 'string', required: true, description: 'API key' },
    debug: { type: 'boolean', required: false, description: 'Enable debug mode', default: false },
    maxResults: { type: 'number', required: false, description: 'Max results', default: 100 },
  }

  it('returns errors for missing required fields', () => {
    const result = validateConfig({}, schema)
    expect(result.valid).toBe(false)
    expect(result.errors).toContain('Missing required field: "apiKey"')
  })

  it('applies default values for missing optional fields', () => {
    const config: Record<string, unknown> = { apiKey: 'key-123' }
    const result = validateConfig(config, schema)
    expect(result.valid).toBe(true)
    expect(config['debug']).toBe(false)
    expect(config['maxResults']).toBe(100)
  })

  it('returns error for wrong type', () => {
    const result = validateConfig({ apiKey: 123 }, schema)
    expect(result.valid).toBe(false)
    expect(result.errors[0]).toMatch(/apiKey/)
    expect(result.errors[0]).toMatch(/string/)
  })

  it('passes when all required fields are present with correct types', () => {
    const result = validateConfig({ apiKey: 'secret' }, schema)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })
})
