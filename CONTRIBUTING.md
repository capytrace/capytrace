# Contributing to CapyTrace

Thank you for helping build the capybara-powered search engine! 🦫

## Development Setup

### Prerequisites

- **Node.js** 18+
- **pnpm** — `npm install -g pnpm`
- **Docker** — for Redis, Qdrant, Ollama
- **Git**

### 1. Clone and install

```bash
git clone https://github.com/capytrace/capytrace.git
cd capytrace
pnpm install
```

### 2. Start infrastructure

```bash
docker compose up -d
ollama pull nomic-embed-text
```

### 3. Configure environment

```bash
cp .env.example .env
# Edit .env with your connector tokens
```

### 4. Start the development servers

```bash
# API + UI together
pnpm dev:all

# Or separately
pnpm dev        # API on :3000
pnpm dev:ui     # UI on :5173
```

The UI is available at **http://localhost:5173**.

---

## Monorepo Structure

| Package | Purpose |
|---|---|
| `packages/core` | Types, embedder, vector store, queue |
| `packages/connectors` | Slack, GitHub, Google Drive connectors |
| `packages/api` | Fastify REST API |
| `packages/ui` | React + Vite search UI |
| `packages/sdk` | Plugin SDK for third-party connectors |
| `packages/cli` | `capytrace` CLI tool |

---

## Building a Custom Connector

Use the Plugin SDK to add new sources:

```typescript
// packages/connectors/src/my-source/index.ts
import { BaseConnector, type Document, type ConnectorConfig } from '@capytrace/sdk'

export class MySourceConnector extends BaseConnector {
  readonly config: ConnectorConfig

  constructor(config: ConnectorConfig) {
    super()
    this.config = config
  }

  async *sync(): AsyncGenerator<Document> {
    // Fetch documents from your source
    const items = await fetchItemsFromMySource()

    for (const item of items) {
      yield this.createDocument({
        sourceType: 'filesystem', // use an existing type or extend the union
        sourceId: this.config.id,
        externalId: item.id,
        title: item.title,
        content: item.body,
        metadata: { author: item.author },
        url: item.url,
      })
    }
  }
}
```

Then register it in the orchestrator (`packages/api/src/orchestrator.ts`).

---

## Running Tests

```bash
# All packages
pnpm test

# Single package
pnpm --filter @capytrace/api test

# Type checking
pnpm typecheck
```

---

## Commit Convention

We follow **Conventional Commits**:

```
<type>(<scope>): <description>

feat(connectors): add Notion connector
fix(api): handle empty search results correctly
docs: update quickstart in README
chore(deps): update vite to 6.x
refactor(core): simplify chunker logic
test(api): add search endpoint tests
```

**Types:** `feat` · `fix` · `docs` · `chore` · `refactor` · `test` · `perf` · `ci`

**Scopes:** `api` · `ui` · `core` · `connectors` · `sdk` · `cli`

---

## Opening a Pull Request

1. **Fork** the repository and create a branch from `main`:
   ```bash
   git checkout -b feat/my-connector
   ```

2. **Make your changes** — keep PRs focused on a single concern.

3. **Run checks** before pushing:
   ```bash
   pnpm typecheck
   pnpm test
   pnpm lint
   ```

4. **Push** your branch and open a PR against `main`.

5. **PR description** should include:
   - What the change does and why
   - How to test it manually
   - Screenshots for UI changes

---

## Code Style

- **TypeScript strict mode** — no `any`, handle nulls explicitly
- **Prettier** for formatting — runs automatically on commit via Husky
- **ESLint** — run `pnpm lint` to check

---

## Questions?

Open a [GitHub Discussion](https://github.com/capytrace/capytrace/discussions) or file an issue.
