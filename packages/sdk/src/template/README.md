# Building a CapyTrace Connector

This guide walks you through creating a custom connector that integrates with CapyTrace.

## Quick Start

1. Copy `my-connector.ts` and `plugin.ts` into your project
2. Implement `sync()` to yield documents from your data source
3. Point `CAPYTRACE_PLUGINS` to your built plugin file

## Step-by-Step

### 1. Extend BaseConnector

```ts
import { BaseConnector } from '@capytrace/sdk'
import type { ConnectorConfig, Document } from '@capytrace/sdk'

export class NotionConnector extends BaseConnector {
  readonly config: ConnectorConfig

  constructor(config: ConnectorConfig) {
    super()
    this.config = config
  }

  async *sync(): AsyncGenerator<Document> {
    for (const page of await this.fetchPages()) {
      yield this.createDocument({
        sourceType: 'filesystem', // use any string identifier
        sourceId: this.config.id,
        externalId: page.id,
        title: page.title,
        content: page.plainText,
        url: page.url,
        metadata: { notionId: page.id },
      })
    }
  }

  private async fetchPages() {
    // your API calls here
    return []
  }
}
```

### 2. Export manifest and createConnector

```ts
// plugin.ts
import type { CapyTracePlugin } from '@capytrace/sdk'
import { NotionConnector } from './notion-connector.js'

export const manifest = {
  name: 'notion-connector',
  version: '1.0.0',
  description: 'Index Notion pages into CapyTrace',
  author: 'Your Name',
  sourceType: 'notion',
  configSchema: {
    token: { type: 'string', required: true, description: 'Notion integration token' },
  },
} satisfies CapyTracePlugin['manifest']

export function createConnector(config) {
  return new NotionConnector(config)
}
```

### 3. Register in .env

```env
CAPYTRACE_PLUGINS=./plugins/notion-connector.js
```

Multiple plugins are comma-separated:

```env
CAPYTRACE_PLUGINS=./plugins/notion-connector.js,./plugins/confluence-connector.js
```

## createDocument() helper

`BaseConnector.createDocument()` auto-fills:

| Field | Value |
|-------|-------|
| `id` | `randomUUID()` |
| `stableId` | `${sourceType}:${sourceId}:${externalId}` |
| `createdAt` | `new Date()` |
| `updatedAt` | `new Date()` |
| `permissions` | `['*']` (override by passing `permissions`) |

## Validating plugin config

Use `validateConfig` to check user-supplied config against your schema:

```ts
import { validateConfig } from '@capytrace/sdk'

const { valid, errors } = validateConfig(userConfig, manifest.configSchema)
if (!valid) throw new Error(errors.join(', '))
```
