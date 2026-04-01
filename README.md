<h1 align="center">🦫 CapyTrace</h1>

<p align="center">
  <strong>Corporate knowledge search engine — self-hosted, open source, semantic.</strong>
</p>

<p align="center">
  Index knowledge from Slack, GitHub, Google Drive and more into a single search API powered by local AI.
  Your data never leaves your infrastructure.
</p>

---

## ✨ Features

- **Semantic search** across all your corporate knowledge — not just keywords
- **Connectors** for Slack, GitHub and Google Drive (more via Plugin SDK)
- **Local AI embeddings** via Ollama — zero data sent to third parties
- **Simple self-hosting** with Docker Compose in under 5 minutes
- **Plugin SDK** to build custom connectors in TypeScript
- **Search UI** included — dark-mode, responsive, instant results

---

## 🚀 Quick Start (5 minutes)

### Prerequisites

- [Docker](https://www.docker.com/get-started) and Docker Compose
- Node.js 18+
- pnpm — `npm install -g pnpm`

### Option A — Interactive wizard (recommended)

```bash
npx @capytrace/cli init
```

The wizard will ask which connectors to enable, collect your credentials, and generate `.env` and `docker-compose.yml`.

### Option B — Manual setup

```bash
git clone https://github.com/capytrace/capytrace.git
cd capytrace

# 1. Configure environment
cp .env.example .env
# Edit .env with your Slack/GitHub/Drive tokens

# 2. Start infrastructure
docker compose up -d

# 3. Pull the embedding model (first run only)
ollama pull nomic-embed-text

# 4. Install dependencies and start
pnpm install
pnpm dev:all
```

Open **http://localhost:5173** to start searching.

---

## 📦 Architecture

```
Sources (Slack, GitHub, Drive)
  → Connectors  (packages/connectors)
    → BullMQ Queue  (Redis)
      → Indexing Worker
        → Chunker → Ollama Embedder → Qdrant
          → Search API  (packages/api)  :3000
            → Web UI  (packages/ui)  :5173
```

---

## ⚙️ Configuration

All configuration is done via environment variables. See [`.env.example`](.env.example) for the full reference.

### Key variables

```env
# Infrastructure (defaults work with docker compose up -d)
REDIS_HOST=localhost
QDRANT_URL=http://localhost:6333
OLLAMA_URL=http://localhost:11434

# Slack
SLACK_BOT_TOKEN=xoxb-...
SLACK_CHANNELS=C0123456789,C9876543210

# GitHub
GITHUB_TOKEN=ghp_...
GITHUB_REPOS=owner/repo1,owner/repo2

# Google Drive
GOOGLE_SERVICE_ACCOUNT_KEY=./credentials/google-service-account.json
GOOGLE_DRIVE_FOLDER_IDS=your_folder_id
```

---

## 🌐 API Reference

### `POST /search`

```bash
curl -X POST http://localhost:3000/search \
  -H "Content-Type: application/json" \
  -d '{"query": "deployment process", "limit": 5}'
```

```json
{
  "results": [
    {
      "score": 0.92,
      "title": "How we deploy to production",
      "snippet": "We use GitHub Actions with...",
      "sourceType": "github",
      "url": "https://github.com/..."
    }
  ],
  "total": 1,
  "took": 43
}
```

Filter by source: `"filters": { "sourceType": "slack" }`

### `GET /health`

Returns service status (200 = ok, 503 = degraded):

```json
{ "status": "ok", "services": { "redis": true, "qdrant": true, "ollama": true } }
```

### `GET /sources`

Lists all configured connectors and their last sync time.

### `POST /sync`

Triggers an immediate sync across all connectors.

---

## 🔌 Building a Connector

Use the Plugin SDK to add new sources:

```typescript
import { BaseConnector, type Document, type ConnectorConfig } from '@capytrace/sdk'

export class NotionConnector extends BaseConnector {
  readonly config: ConnectorConfig

  constructor(config: ConnectorConfig) {
    super()
    this.config = config
  }

  async *sync(): AsyncGenerator<Document> {
    const pages = await fetchNotionPages()
    for (const page of pages) {
      yield this.createDocument({
        sourceType: 'filesystem',
        sourceId: this.config.id,
        externalId: page.id,
        title: page.title,
        content: page.markdown,
        metadata: { author: page.author },
        url: page.url,
      })
    }
  }
}
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for a full walkthrough.

---

## 🛠 CLI

```bash
capytrace init      # Setup wizard — generate .env and docker-compose.yml
capytrace start     # Start with Docker Compose (production)
capytrace stop      # Stop all containers
capytrace sync      # Trigger manual sync
capytrace status    # Show service and connector status
capytrace logs -f   # Stream logs
```

---

## 📁 Packages

| Package | Description |
|---|---|
| `packages/core` | Types, chunker, embedder, Qdrant client, BullMQ queue |
| `packages/connectors` | Slack, GitHub, Google Drive connectors |
| `packages/api` | Fastify REST API + connector orchestrator |
| `packages/ui` | React + Vite + Tailwind search UI |
| `packages/sdk` | Plugin SDK for building custom connectors |
| `packages/cli` | `capytrace` CLI |

---

## 🏗 Self-Hosting (Production)

```bash
# Build and start everything with Docker
docker compose -f docker-compose.prod.yml up -d --build

# The UI is served at :5173, API at :3000
```

All services (Qdrant, Redis, Ollama, API, UI) run in an isolated Docker network with restart policies and healthchecks.

---

## 🧑‍💻 Development

```bash
pnpm typecheck    # Type-check all packages
pnpm test         # Run all tests
pnpm lint         # ESLint
pnpm build        # Build all packages
```

---

## 📄 License

AGPL-3.0 — free for self-hosting. Commercial license available for SaaS deployments.
