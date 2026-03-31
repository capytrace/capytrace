<h1 align="center">FerretSearch</h1>

<p align="center"
  <img width="1536" height="1024" alt="ferretsearch_textnobg" src="https://github.com/user-attachments/assets/210080a2-f9a5-4bfe-8d37-c9750868f25f" />

</p>

**Corporate open-source search engine.** Index knowledge from Slack, GitHub, and your filesystem into a single semantic search API.

FerretSearch connects to your internal tools, chunks and embeds documents locally using [Ollama](https://ollama.com), stores vectors in [Qdrant](https://qdrant.tech), and exposes a search API that returns the most relevant results across all sources.

---

## How it works

```
Sources (Slack, GitHub, ...) → Connectors → BullMQ Queue → Indexing Pipeline → Qdrant
                                                                                    ↓
                                                          User query → Embed → Vector Search
```

1. **Connectors** sync documents from configured sources into a BullMQ queue
2. **Workers** pick up each job, chunk the document, embed it via Ollama, and upsert vectors into Qdrant
3. **Search API** embeds the query and performs approximate nearest-neighbour search in Qdrant

---

## Packages

| Package | Description |
|---|---|
| `packages/core` | Indexing pipeline: types, chunker, embedder, Qdrant client, BullMQ queue/worker, parsers |
| `packages/connectors` | Source connectors — Slack and GitHub |
| `packages/api` | Fastify REST API + orchestrator that manages connector lifecycle |
| `packages/sdk` | _(planned)_ TypeScript SDK |
| `packages/ui` | _(planned)_ Web UI |

---

## Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| Node.js | ≥ 18 | Runtime |
| pnpm | ≥ 10 | Package manager |
| Redis | ≥ 7 | BullMQ job queue |
| Qdrant | latest | Vector database |
| Ollama | latest | Local embedding model |

### Embedding model

FerretSearch uses `nomic-embed-text` by default (768-dimensional vectors). Pull it before starting:

```bash
ollama pull nomic-embed-text
```

---

## Quick start

### 1. Clone and install

```bash
git clone https://github.com/your-org/ferretsearch.git
cd ferretsearch
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
```

This starts Redis (6379), Qdrant (6333), and Ollama (11434).

### 3. Configure environment

```bash
cp .env.example .env
```

Edit `.env` and fill in your connector tokens (see [Configuration](#configuration) below).

### 4. Run

```bash
pnpm dev
```

The API will be available at `http://localhost:3000`.

---

## Configuration

All configuration is done via environment variables. Copy `.env.example` to `.env` and fill in the values.

### Infrastructure

```env
REDIS_HOST=localhost
REDIS_PORT=6379

QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434
```

### API server

```env
API_PORT=3000          # default: 3000
WORKER_CONCURRENCY=5   # parallel indexing jobs, default: 5
```

### Slack connector

Set `SLACK_BOT_TOKEN` to enable Slack indexing. The bot needs `channels:history` and `channels:read` scopes.

```env
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNELS=C0123456789,C9876543210   # comma-separated channel IDs
SLACK_SYNC_HISTORY_DAYS=7                # how far back to sync, default: 30
```

To find channel IDs: run `pnpm --filter @ferretsearch/connectors list-channels` after setting the token.

### GitHub connector

Set `GITHUB_TOKEN` to enable GitHub indexing. Use a classic token with `repo` scope or a fine-grained token with read access.

```env
GITHUB_TOKEN=ghp_...
GITHUB_REPOS=owner/repo1,owner/repo2     # required: repos to index

GITHUB_INDEX_README=true                 # default: true
GITHUB_INDEX_ISSUES=true                 # default: true
GITHUB_INDEX_PRS=true                    # default: true
GITHUB_INDEX_WIKI=true                   # default: true
GITHUB_INDEX_CODE=false                  # default: false — opt-in required
GITHUB_CODE_EXTENSIONS=.ts,.js,.py,.go,.java
GITHUB_SYNC_INTERVAL_MINUTES=60
```

> **Note:** Code indexing (`GITHUB_INDEX_CODE`) is disabled by default. Enable it only when needed — large repos can exhaust the GitHub rate limit quickly.

### YAML config (alternative)

You can also configure connectors in `ferretsearch.config.yml` at the project root. Environment variables always take priority.

```yaml
connectors:
  slack:
    botToken: xoxb-...
    channels:
      - C0123456789
    syncHistoryDays: 7

  github:
    token: ghp_...
    repos:
      - owner/repo
    indexCode: false
    codeExtensions:
      - .ts
      - .py
```

---

## API

### `POST /search`

Semantic search across all indexed documents.

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment process", "limit": 5}'
```

**Request body:**

```json
{
  "query": "string",
  "limit": 10,
  "filters": {
    "sourceType": "slack",
    "author": "alice"
  }
}
```

**Response:**

```json
{
  "results": [
    {
      "documentId": "...",
      "chunkId": "...",
      "score": 0.92,
      "title": "How we deploy to production",
      "snippet": "We use GitHub Actions with...",
      "url": "https://github.com/...",
      "sourceType": "github",
      "highlights": []
    }
  ],
  "total": 1,
  "took": 43
}
```

### `GET /health`

Returns health status of all dependencies.

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "services": { "redis": true, "qdrant": true, "ollama": true }
}
```

Returns `503` when any service is unreachable.

### `GET /sources`

Lists all active connectors and their sync status.

```bash
curl http://localhost:3000/sources
```

```json
[
  {
    "id": "slack",
    "type": "slack",
    "status": "idle",
    "lastSync": "2024-01-15T10:30:00.000Z",
    "documentsIndexed": 1243
  }
]
```

### `POST /sync`

Triggers an immediate manual sync of all connectors.

```bash
curl -X POST http://localhost:3000/sync
```

```json
{ "queued": 87, "connectors": ["slack", "github"] }
```

---

## Development

### Run all tests

```bash
pnpm test
```

### Typecheck

```bash
pnpm typecheck
```

### Lint

```bash
pnpm lint
pnpm lint:fix
```

### Smoke test a connector

Connects and streams documents without indexing — useful to validate credentials and inspect output:

```bash
# Slack
pnpm --filter @ferretsearch/connectors smoke

# GitHub
pnpm --filter @ferretsearch/connectors smoke:github
```

### Project structure

```
ferretsearch/
├── packages/
│   ├── core/
│   │   └── src/
│   │       ├── types.ts              # Document, Chunk, SearchResult, IConnector
│   │       ├── chunker/              # SlidingWindowChunker
│   │       ├── embedder/             # OllamaEmbedder (Ollama REST API)
│   │       ├── parser/               # PDF, DOCX, TXT parsers
│   │       ├── queue/                # BullMQ indexQueue + indexWorker
│   │       └── qdrant/               # QdrantStore (upsert + search)
│   ├── connectors/
│   │   └── src/
│   │       ├── slack/                # SlackConnector, SlackClient, FileDownloader
│   │       ├── github/               # GitHubConnector, GitHubClient
│   │       └── config/               # loader.ts, githubLoader.ts
│   └── api/
│       └── src/
│           ├── main.ts               # Startup: health checks, orchestrator, server
│           ├── server.ts             # Fastify routes
│           └── orchestrator.ts       # Connector lifecycle management
├── docker-compose.yml
├── .env.example
└── ferretsearch.config.yml           # optional YAML config
```

### Adding a connector

Implement the `IConnector` interface from `@ferretsearch/core`:

```typescript
import type { IConnector, ConnectorConfig, Document } from '@ferretsearch/core'

export class MyConnector implements IConnector {
  readonly config: ConnectorConfig

  constructor(config: ConnectorConfig) {
    this.config = config
  }

  async connect(): Promise<void> {
    // validate credentials
  }

  async *sync(): AsyncGenerator<Document> {
    // yield documents
  }

  async disconnect(): Promise<void> {
    // cleanup
  }
}
```

Then register it in `packages/api/src/orchestrator.ts` by checking for its environment token.

---

## Tech stack

| Layer | Technology |
|---|---|
| Language | TypeScript (strict, ES2022, NodeNext) |
| API | [Fastify](https://fastify.dev) |
| Queue | [BullMQ](https://bullmq.io) + Redis |
| Vector DB | [Qdrant](https://qdrant.tech) |
| Embeddings | [Ollama](https://ollama.com) (`nomic-embed-text`) |
| Slack | [@slack/web-api](https://github.com/slackapi/node-slack-sdk) |
| GitHub | [@octokit/rest](https://github.com/octokit/rest.js) |
| Testing | [Vitest](https://vitest.dev) |
| Monorepo | pnpm workspaces |

---

## License

MIT
