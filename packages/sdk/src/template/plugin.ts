/**
 * plugin.ts — Entry point for a CapyTrace plugin
 *
 * This is the file referenced in CAPYTRACE_PLUGINS.
 * It must export `manifest` and `createConnector` at the top level.
 *
 * Usage in .env:
 *   CAPYTRACE_PLUGINS=./plugins/my-connector.js
 */
import type { CapyTracePlugin, ConnectorConfig } from '../types.js'
import { MyConnector } from './my-connector.js'

const plugin: CapyTracePlugin = {
  manifest: {
    name: 'my-connector',
    version: '1.0.0',
    description: 'A sample connector built with the CapyTrace SDK',
    author: 'Your Name',
    sourceType: 'filesystem', // replace with your source identifier
    configSchema: {
      apiKey: {
        type: 'string',
        required: true,
        description: 'API key for authenticating with My Source',
      },
      maxResults: {
        type: 'number',
        required: false,
        description: 'Maximum number of results to fetch per sync',
        default: 100,
      },
    },
  },

  createConnector(config: ConnectorConfig) {
    return new MyConnector(config)
  },
}

export const { manifest, createConnector } = plugin
