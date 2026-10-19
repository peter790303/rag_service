# Retrieval HTTP error contract

`POST /v1/retrieve/hybrid` uses the authenticated `projectId` scope. A `documentReference` must identify exactly one document within that scope. Neither missing references nor ambiguous references permit a search in another project.

If reference resolution finds zero or multiple documents, or retrieval cannot assemble other required facts, the API returns HTTP **409**:

```json
{
  "code": "KNOWLEDGE_RETRIEVAL_INCOMPLETE",
  "message": "Knowledge retrieval is missing required facts"
}
```

The response is identical for zero and multiple matches. All `KnowledgeRetrievalIncompleteException` subclasses use this response; internal document/index/revision/relation IDs, match counts, exception context and stack traces are omitted. An incomplete retrieval is an error, not a successful empty result.

Existing request boundaries remain in force: a mismatched authenticated project scope returns **401** before retrieval. Invalid request fields return **422**; `topK` and `limit`, when supplied, are integers from 1 through 100. A pending index remains **409** with `REQUIRED_KNOWLEDGE_INDEX_PENDING`; unavailable query embeddings remain **502** with `KNOWLEDGE_EMBEDDING_UNAVAILABLE`. Unexpected exceptions retain the generic **500** response.

The implementation source of truth is [ApplicationErrorFilter](src/Interfaces/Http/ExceptionHandlers/application-error.filter.ts), with request constraints in [HybridKnowledgeRetrievalRequest](src/Interfaces/Http/Requests/hybrid-knowledge-retrieval.request.ts). [HTTP contract tests](tests/Feature/Http/http-contract.test.ts) cover zero/multiple matches, other incomplete facts, safe response fields, authorization, validation and unexpected failures. These local mock tests do not establish environment or retrieval-data acceptance.
