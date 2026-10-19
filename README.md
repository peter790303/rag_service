# RAG Service

Standalone NestJS service for document indexing, version activation and project-scoped retrieval. It owns its PostgreSQL schema and does not import Agent-Teams application code.

## Structure

- `src/Domain/{EntitySingular}`: Entities and their values, including `Document/ValueObjects/date-time.ts` and `DocumentRevision/ValueObjects/source-line-range.ts`.
- `src/Application/{EntityPlural}`: business UseCases, Contracts, Assemblers, Events and Listeners. Document indexing runs through `DocumentIndexes/Listeners`; chunk planning belongs to `Chunks/Contracts`.
- `src/Infrastructure`: TypeORM Models/Repositories, provider implementations, authentication and dependency injection. `jobs` / `failed_jobs` are technical persistence records.
- `src/Interfaces/Http`: Controllers, requests and Resources; `database/migrations`: ordered schema changes.

Start with [AGENTS.md](AGENTS.md) for project and memory entry points. The [Obsidian coding standards](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md) contain development rules and the narrowly scoped vector SQL, RAG Hybrid full-text SQL and technical Resource exceptions. The [Chunks baseline](</Users/xiang/Documents/Worker/BackEnd/Rag-Service/Chunks 基準.md>), [remaining acceptance](#remaining-acceptance) and [database schema](assets/diagrams/rag-database-schema.md) provide the maintained documentation. Models and migrations remain the executable schema sources.

Parameterized SQL is permitted only for Chunk vector similarity and RAG Hybrid full-text matching and relevance ranking, within the existing TypeORM read transaction. Other queries retain the native ORM requirement. See the [SQL exception scope](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#orm-與向量查詢例外) and [remaining activation requirements](#remaining-acceptance).

## Run

Use Node `>=26.8.1 <27` and npm `>=11 <12`, as required by [package.json](package.json).

The fresh schema baseline registers eleven migrations: 0000–0009 plus 0014 (document index success receipts). Initial creates include the unique knowledge-base project ID, nullable document title and nullable job lease-expiry column with its recovery index. New chunk writes retain positional search vectors. The consolidated baseline has been rebuilt and the vault imported and verified. This migration chain initializes a fresh schema; editing a CREATE migration does not upgrade an existing database or replay historical backfills. Receipt migration 0014 stores actual successful execution facts with non-null attempts and completion time. Success receipts remain persistent records without an automatic deletion policy.

The validated host configuration uses `gpt-6.1-sol` through the host Codex CLI and existing host login; no chunking URL is required. Embedding uses in-process offline CPU inference with the preserved `Xenova/paraphrase-multilingual-MiniLM-L12-v2` cache, revision `2c4055b12046f11709e9df2c122e59ffbdc2f900`, q8 weights, mean pooling, normalization and 384 dimensions. Host CLI planning, local embedding, worker indexing and scoped Hybrid retrieval have passed runtime acceptance; see the [acceptance summary](#remaining-acceptance).

1. Copy [.env.example](.env.example) to `.env`; set database credentials, the embedding cache directory and `RAG_SERVICE_AUTH_SECRET`. The embedding model and revision are pinned in the example; the cache must already contain their model and tokenizer files. Install Codex on the host and verify its existing login with `codex login status`. Chunk planning defaults to `RAG_CHUNKING_TRANSPORT=host-cli` and `gpt-6.1-sol`.
2. Start the database with `docker compose up -d database`; it listens on `127.0.0.1:30684`.
3. On the host, run `npm ci`, `npm run build`, `npm run migration:run`, then `npm start` and `npm run start:worker` in separate terminals. The API defaults to port `30700`.

For an explicitly selected HTTP chunk planner, set `RAG_CHUNKING_API_URL` and its credentials as needed. The container API/worker explicitly use HTTP transport for both providers and require their configured URLs because the image does not include the host Codex executable, login or preserved embedding cache; this optional mode starts with `docker compose up --build` and exposes the API on `127.0.0.1:30682`.

`GET /health` checks the API process, not database/provider/worker readiness. Local embedding uses the pinned multilingual model and existing cache without an HTTP endpoint or model download. Explicit HTTP embedding transport expects an OpenAI-compatible embeddings response whose vector length matches the configured dimensions; chunk planning invokes the host Codex CLI in a temporary read-only workspace, or an OpenAI-compatible chat-completions endpoint when HTTP transport is selected.

### Configuration

These values come from [knowledge-service.config.ts](config/knowledge-service.config.ts). Migration commands load only database configuration; API and worker require the full service configuration.

| Variable                                         | Requirement / default                                                                                                       |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| `RAG_DATABASE_URL`                               | Required PostgreSQL URL. Compose supplies its internal database URL.                                                        |
| `RAG_DB_SCHEMA`                                  | `public`                                                                                                                    |
| `PORT`                                           | `30700`; Compose maps host `30682` to this port.                                                                            |
| `RAG_SERVICE_AUTH_SECRET`                        | Required, at least 32 characters after trimming.                                                                            |
| `RAG_EMBEDDING_TRANSPORT`                        | `local` (default) or `http`; local inference uses the offline model cache.                                                  |
| `RAG_EMBEDDING_CACHE_DIR`                        | `.cache/embeddings`; set an absolute path when reusing the existing AgentTeams cache.                                       |
| `RAG_EMBEDDING_REVISION`                         | `2c4055b12046f11709e9df2c122e59ffbdc2f900` for the original model; custom local models require an explicit revision.        |
| `RAG_EMBEDDING_API_URL`                          | Required only for explicit `http` embedding transport.                                                                      |
| `RAG_EMBEDDING_API_KEY` / `RAG_CHUNKING_API_KEY` | Optional endpoint credentials.                                                                                              |
| `RAG_EMBEDDING_MODEL`                            | `Xenova/paraphrase-multilingual-MiniLM-L12-v2`; changing the model changes index identity and requires matching dimensions. |
| `RAG_EMBEDDING_DIMENSIONS`                       | `384`; must match the provider and stored vector schema.                                                                    |
| `RAG_CHUNKING_TRANSPORT`                         | `host-cli` (default) or `http`; HTTP requires `RAG_CHUNKING_API_URL`.                                                       |
| `RAG_CHUNKING_CLI_PATH`                          | `CODEX_CLI_PATH`, falling back to `codex`; host CLI executable.                                                             |
| `RAG_CHUNKING_CLI_MAX_OUTPUT_BYTES`              | `4194304`; maximum captured CLI output bytes.                                                                               |
| `RAG_CHUNKING_MODEL`                             | `gpt-6.1-sol`                                                                                                               |
| `RAG_EXTERNAL_REQUEST_TIMEOUT_MS`                | `30000`; timeout for each embedding request or chunk-planning invocation.                                                   |
| `RAG_JOB_LEASE_SECONDS`                          | `300`                                                                                                                       |
| `RAG_WORKER_POLL_MS`                             | `1500`                                                                                                                      |
| `RAG_GC_POLL_MS` / `RAG_GC_RETENTION_MS`         | `60000` / `86400000`                                                                                                        |
| `POSTGRES_PASSWORD`                              | Required by Compose; not a service configuration field.                                                                     |

Numeric settings must be positive safe integers. Example values do not establish provider availability or production readiness.

### Cutover and rollback

Treat the RAG API/worker environment, RAG database migrations, and AgentTeams caller configuration as separate activation steps. Task and Plan persistence stays in the AgentTeams business database; it does not move into the RAG schema. Record the previous caller endpoint before changing it, and preserve both databases.

After migrations, verify the actual API and worker configuration: database identity/schema, provider endpoints/models/dimensions, request timeout, lease, polling and retention settings. Record process IDs and ports without credentials. `/health` alone does not establish database, provider or worker readiness. Confirm authenticated indexing and retrieval through the configured AgentTeams endpoint before accepting the cutover.

Activation requires versioned RAG evidence for indexing, unchanged reuse, source changes, scoped retrieval and fixture cleanup; see [remaining acceptance](#remaining-acceptance). Agent-Teams owns [Plan reset/checkpoint/seal/CLI acceptance](</Users/xiang/Documents/Worker/BackEnd/Agent-Teams/Plan 驗收.md>). A configured endpoint or passing unit suite alone does not complete activation. Retire an old store only after acceptance passes and its exact contents and ownership have been identified.

To roll back the caller, restore its recorded endpoint/authentication configuration and restart only the task-owned process if needed. Verify the persisted Task/Plan still loads. Preserve migrations, index data and acceptance manifests; do not reset a shared schema, remove database volumes or stop shared proxies as a rollback step. Record an actual rollback separately from this procedure.

For the current host deployment, use this stop/change/start sequence:

1. Pause new indexing submissions in the caller. Wait for the owned indexing jobs to finish and resolve failed jobs before stopping the worker; stopping the process does not drain an in-flight provider call. In the terminals that own the worker and API, press `Ctrl-C` after the jobs drain.
2. Record the previous database/schema, model/transport, timeout/lease/polling settings and caller endpoint/authentication configuration locally without publishing secrets. Edit the service `.env` and caller configuration. Both API and worker must load the same service settings. The accepted model configuration is `RAG_CHUNKING_TRANSPORT=host-cli`, `RAG_CHUNKING_MODEL=gpt-6.1-sol`, `RAG_EMBEDDING_TRANSPORT=local`, `RAG_EMBEDDING_MODEL=Xenova/paraphrase-multilingual-MiniLM-L12-v2`, and `RAG_EMBEDDING_DIMENSIONS=384`; keep the pinned embedding revision and absolute cache path from the accepted configuration snapshot. Provider URLs are unnecessary for these transports.
3. From the repository root, run `npm start` in the API terminal and `npm run start:worker` in a second terminal. These commands load `.env` and run the existing `dist`; use the already validated build for a configuration-only restart.
4. Run `curl --fail --silent http://127.0.0.1:30700/health` for the accepted local API port (substitute the configured port when changed). Then use the caller's authenticated indexing/status/retrieval flow: a known unchanged source must reuse its READY index, the job must finish, and scoped retrieval must return evidence. Resume submissions after these checks. A pending or failed required full-content index must block retrieval with HTTP 409 instead of returning partial context.

To restore the previous configuration, repeat the drain and `Ctrl-C` step, restore the recorded `.env` fields and caller endpoint/authentication settings, and restart with the same two commands. Repeat the health, authenticated reuse/retrieval and persisted Task/Plan checks before resuming submissions. This restores process configuration; it does not reverse migrations or indexed data. These are executable operating instructions, not evidence that a configuration restoration has been exercised.

## HTTP contract

The 2026-10-19 naming decision uses `KnowledgeBaseDocument` for this concept across the Domain, Application, ORM Model and Repository, with the Application feature named `KnowledgeBaseDocuments`. The table remains `knowledge_base_documents`; its columns, stored data and existing HTTP routes and payload fields remain compatible. The `/memberships/prune` route below, existing `error.code` values containing `MEMBERSHIP`, and externally exposed exception messages retain their public spelling for compatibility.

| Route                                                | Input / behavior                                                                                                                                                                                                                                   |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /health`                                        | Unauthenticated process health.                                                                                                                                                                                                                    |
| `POST /v1/index-requests`                            | `knowledgeBaseId`, `projectId`, `projectName`, `sourceType`, `sourceKey`, `sourcePath`, `content`; optional `title`, `payload`, `isEntry`, `alwaysIncludeFullContent`. Returns source/version/index/KnowledgeBaseDocument and generation metadata. |
| `POST /v1/retrieve/hybrid`                           | `projectId`, `queryText`; optional `topK` / `limit` (1–100), `documentReference`, `includeNonEffective`, `queryVector`, `embeddingModelId`. Combines scoped lexical and vector candidates.                                                         |
| `GET /v1/projects/:projectId/jobs/:id`               | Project-scoped indexing status.                                                                                                                                                                                                                    |
| `POST /v1/projects/:projectId/failed-jobs/:id/retry` | Project-scoped manual retry.                                                                                                                                                                                                                       |
| `POST /v1/knowledge-bases/:id/memberships/prune`     | `projectId`, `documentIds`; retains the listed document IDs and removes other KnowledgeBaseDocument relations in the authorized knowledge base. An empty list retains none.                                                                        |

Required full-content documents whose indexes are pending cause `409 REQUIRED_KNOWLEDGE_INDEX_PENDING`. Request definitions and output Resources live under [Interfaces/Http](src/Interfaces/Http).

### Service authentication

Every `/v1` route uses [ProjectServiceAuthGuard](src/Interfaces/Http/Middleware/project-service-auth.guard.ts). Supply `x-rag-project-id`, `x-rag-issued-at` (13-digit Unix milliseconds, within five minutes) and `x-rag-signature` (64 hex characters). All project IDs supplied in route parameters, JSON body or query must match the header.

The [HMAC authenticator](src/Infrastructure/Auth/hmac-project-service.authenticator.ts) signs this newline-joined string with HMAC-SHA256 and `RAG_SERVICE_AUTH_SECRET`:

```text
HTTP_METHOD
request.path (without query string)
x-rag-issued-at
projectId
sha256(JSON.stringify(parsedBody ?? {})) as lowercase hex
```

Use the same JSON serialization/property order as the parsed request body; an absent body hashes `{}`. Send the HMAC digest as hex in `x-rag-signature`.

## Verification

- `npm run check`: ESLint, Prettier, TypeScript no-emit and Nest build.
- `npm test`: compile tests and run Unit / Feature suites.
- `npm run test:integration`: run Integration tests serially against the configured database with per-run schema isolation; do not replace isolation with `synchronize` or a shared-schema reset.
- `npm run format`: fix ESLint layout and format JS/TS/JSON/YAML; Markdown is not included in this script.

Current validation evidence, fixed review scopes and their limits are recorded in [RAG 驗收紀錄](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/驗收紀錄.md); remaining work is tracked below. Pure documentation changes validate content and links without implying a new runtime test pass.

Only when selecting HTTP transport, provider URLs used by host API/worker processes must use a host-reachable address such as `127.0.0.1`; the Compose provider hostname `host.docker.internal` is for processes running inside containers.

## Remaining acceptance

RAG 本次驗收已通過：完整靜態檢查、單元／Feature 與真實 PostgreSQL integration、獨立 Standards／Spec review、重建與來源匯入、未變更來源重用，以及具實際 lexical／semantic evidence 的 scoped Hybrid 檢索。實際 host CLI 與本機 embedding 流程已驗證；隔離環境另以真實 API／worker／PostgreSQL 搭配受控 provider 驗證跨 lease 續租、失敗歸檔與手動重試，以及必要全文未就緒時阻擋部分檢索。

完整驗收範圍、證據、最新資料快照與驗證限制見 [RAG 驗收紀錄](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/驗收紀錄.md)。啟停與設定回復步驟見 [Cutover and rollback](#cutover-and-rollback)；設定回復程序尚未實際演練。

Agent-Teams 的 endpoint 接線、來源／改名／watcher／prune、角色與 pipeline 映射、整體 context 預算、Task／Plan 業務 DB 邊界、舊儲存退役及 Plan fixture 等下游未完成範圍，統一見 [Agent-Teams Plan 驗收](</Users/xiang/Documents/Worker/BackEnd/Agent-Teams/Plan 驗收.md>)；RAG 驗收通過不代表下游驗收已完成。
