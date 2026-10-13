# RAG Service

Standalone NestJS service for RAG document indexing, hybrid retrieval, and knowledge base membership maintenance. It owns the RAG persistence schema and does not import code from `agent-teams`.

## Structure

- `src/Domain/Knowledge` — chunk planning factory, retrieval ranking and retention rules, and domain exceptions.
- `src/Application/KnowledgeBases` — indexing and retrieval use cases.
- `src/Infrastructure/Persistence/Models` — TypeORM entities; `Providers` wires Nest and persistence.
- `src/Interfaces/Http/Controllers` — versioned HTTP boundary.
- `database/migrations` — ordered, single-responsibility schema migrations.

The canonical table specification is [assets/diagrams/rag-database-schema.md](assets/diagrams/rag-database-schema.md).

## Run

Use Node.js 26.8.1 and npm 11. Copy `.env.example` to `.env` and set a local `POSTGRES_PASSWORD`, `RAG_EMBEDDING_API_URL`, and any embedding API key. Run `docker compose up --build`; Compose waits for PostgreSQL, applies the ordered migrations in a one-shot service, then starts the API and worker as separate processes. The database is available on loopback port 30684 and the API on loopback port 30682.

For a local non-container run, install dependencies with `npm ci`, build with `npm run build`, apply schema with `npm run migration:run`, then run `npm start` and `npm run start:worker` in separate terminals. `GET /health` reports API process health. The embedding endpoint must implement the OpenAI-compatible `/embeddings` response shape and return vectors matching `RAG_EMBEDDING_DIMENSIONS` (384 by default).

## HTTP contract

- `POST /v1/index-requests` accepts a complete source snapshot (`knowledgeBaseId`, `projectName`, `sourceType`, `sourceKey`, `sourcePath`, `title`, `content`, optional `payload`, `isEntry`, and `alwaysIncludeFullContent`). Returns document/revision/index/job identifiers and generation metadata.
- `POST /v1/retrieve/hybrid` accepts `projectId`, `queryText`, and optional `limit`/`topK`, `documentReference`, `includeNonEffective`; optional `queryVector` and `embeddingModelId` support deterministic integration tests. Returns `{ "matches": [...] }`.
- `GET /v1/jobs/:id` returns job status.
- `POST /v1/knowledge-bases/:id/memberships/prune` accepts `{ "documentIds": [...] }`.
- A required but not-yet-ready index returns HTTP 409 with `{ "code": "REQUIRED_KNOWLEDGE_INDEX_PENDING", "message": "..." }`.

## Verification

Run `npm run check` and `npm test`. To verify migrations against the isolated compose database, run `npm run migration:run` followed by `npm run migration:revert`. PostgreSQL migrations require a configured database; `synchronize` is disabled.
