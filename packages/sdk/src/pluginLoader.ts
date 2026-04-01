import path from 'path'
import { pathToFileURL } from 'url'
import type { CapyTracePlugin } from './types.js'

type ImportFn = (path: string) => Promise<unknown>

export function validatePlugin(plugin: unknown): plugin is CapyTracePlugin {
  if (typeof plugin !== 'object' || plugin === null) return false
  const p = plugin as Record<string, unknown>
  if (typeof p['manifest'] !== 'object' || p['manifest'] === null) return false
  if (typeof p['createConnector'] !== 'function') return false
  return true
}

export async function loadPlugin(
  modulePath: string,
  importFn: ImportFn = (p) => import(p),
): Promise<CapyTracePlugin> {
  // Convert absolute paths to file:// URLs for ESM loader compatibility on Windows
  const resolvedPath = path.resolve(modulePath)
  const moduleUrl = pathToFileURL(resolvedPath).href

  let module: unknown
  try {
    module = await importFn(moduleUrl)
  } catch (err) {
    throw new Error(
      `Failed to load plugin from "${modulePath}": ${err instanceof Error ? err.message : String(err)}`,
    )
  }

  const m = module as Record<string, unknown>

  if (typeof m['manifest'] !== 'object' || m['manifest'] === null) {
    throw new Error(`Plugin at "${modulePath}" is missing a valid "manifest" export`)
  }

  if (typeof m['createConnector'] !== 'function') {
    throw new Error(`Plugin at "${modulePath}" is missing a "createConnector" export`)
  }

  return module as CapyTracePlugin
}