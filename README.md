# RAG Service

Standalone NestJS service for RAG document indexing, hybrid retrieval, and knowledge base membership maintenance. It owns the RAG persistence schema and does not import code from `agent-teams`.

## Structure

- `src/Domain/{EntitySingular}` — domain entities, value objects, invariants and domain exceptions, grouped by their owning entity (for example, `Chunk`).
- `src/Application/{EntityPlural}` — business-owned use cases, DTOs, QueryObjects and contracts across KnowledgeBases, Documents, DocumentRevisions, DocumentIndexes, DocumentRelations, Chunks and Memberships. Index job Events/Listeners belong to DocumentIndexes.
- `src/Infrastructure/Persistence/Models` — persistence models; `Providers` wires Nest and persistence.
- `src/Interfaces/Http/Controllers` — versioned HTTP boundary.
- `database/migrations` — ordered, single-responsibility schema migrations.

The schema design draft is [assets/diagrams/rag-database-schema.md](assets/diagrams/rag-database-schema.md). Current database behavior is defined by the Models and migrations; the draft still needs reconciliation.

TypeORM owns persistence and the read-only retrieval transaction. The authorized vector-query exception uses parameterized SQL through the active TypeORM manager. It applies index scope, cosine-distance ordering, stable ID ordering, and top-K in the database, then restores Domain Chunk entities with vector-distance evidence. Sequelize and its dedicated model, factory, and connection bridge have been removed.

Full-text ranking is unresolved: the installed TypeORM native find APIs cannot express the required PostgreSQL match and relevance ordering, and the SQL exception covers only vector queries. Nonempty lexical queries currently fail explicitly, so hybrid retrieval with search terms is not ready. The existing full-text integration assertions remain in place to expose this gap. See the [blocker and minimum change proposal](docs/lexical-search-blocker-20261015.md).

## Run

Use Node.js 26.8.1 and npm 11. Copy `.env.example` to `.env` and set a local `POSTGRES_PASSWORD`, `RAG_SERVICE_AUTH_SECRET` (at least 32 characters), `RAG_EMBEDDING_API_URL`, `RAG_CHUNKING_API_URL`, and any provider API keys. Local non-container processes also require `RAG_DATABASE_URL`. Run `docker compose up --build`; Compose waits for PostgreSQL, applies the ordered migrations in a one-shot service, then starts the API and worker as separate processes. The database is available on loopback port 30684 and the API on loopback port 30682.

For a local non-container run, install dependencies with `npm ci`, build with `npm run build`, apply schema with `npm run migration:run`, then run `npm start` and `npm run start:worker` in separate terminals. `GET /health` reports API process health. The embedding endpoint must implement the OpenAI-compatible `/embeddings` response shape and return vectors matching `RAG_EMBEDDING_DIMENSIONS` (384 by default).

## HTTP contract

- `POST /v1/index-requests` accepts a complete source snapshot (`knowledgeBaseId`, `projectId`, `projectName`, `sourceType`, `sourceKey`, `sourcePath`, `title`, `content`, optional `payload`, `isEntry`, and `alwaysIncludeFullContent`). Returns document/revision/index/job identifiers and generation metadata.
- `POST /v1/retrieve/hybrid` accepts `projectId`, `queryText`, and optional `limit`/`topK`, `documentReference`, `includeNonEffective`; optional `queryVector` and `embeddingModelId` support deterministic integration tests. Returns `{ "matches": [...] }`.
- `GET /v1/projects/:projectId/jobs/:id` returns job status.
- `POST /v1/projects/:projectId/failed-jobs/:id/retry` requests a retry for a failed job in the project.
- `POST /v1/knowledge-bases/:id/memberships/prune` accepts `{ "projectId": "...", "documentIds": [...] }`.
- A required but not-yet-ready index returns HTTP 409 with `{ "code": "REQUIRED_KNOWLEDGE_INDEX_PENDING", "message": "..." }`.

## Verification

Run `npm run format` to apply ESLint whitespace fixes and Prettier formatting. Imports must be followed by a blank line before declarations or their documentation comments. Both `npm run lint` and `npm run format:check` enforce this spacing.

Run `npm run check` and `npm test`. Database integration is separate: `npm run test:integration` uses a configured PostgreSQL database and isolated test schemas. `synchronize` is disabled; migration validation and reverts belong in a disposable test database.

Read [AGENTS.md](AGENTS.md) for required Obsidian standards and project exceptions. See [docs/README.md](docs/README.md) for the approved Chunks baseline, current verification evidence, commit scope and unfinished work.
