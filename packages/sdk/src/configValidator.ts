import type { PluginManifest } from './types.js'

export function validateConfig(
  config: Record<string, unknown>,
  schema: PluginManifest['configSchema'],
): { valid: boolean; errors: string[] } {
  const errors: string[] = []

  for (const [key, field] of Object.entries(schema)) {
    const value = config[key]

    if (value === undefined) {
      if (field.required) {
        errors.push(`Missing required field: "${key}"`)
      } else if (field.default !== undefined) {
        config[key] = field.default
      }
      continue
    }

    const actualType = typeof value
    if (actualType !== field.type) {
      errors.push(`Field "${key}" must be of type "${field.type}", got "${actualType}"`)
    }
  }

  return { valid: errors.length === 0, errors }
}
