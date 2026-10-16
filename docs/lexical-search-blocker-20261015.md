# 全文檢索阻塞

狀態：未完成；更新：2026-10-16。SQL 授權只包含 [Chunk 向量查詢](../AGENTS.md#orm-與向量查詢例外)，不包含全文檢索或 relevance 排名。

## 目前行為與影響

[FindLexicalChunkCandidatesUseCase](../src/Application/Chunks/UseCases/find-lexical-chunk-candidates.use-case.ts) 將原始 `queryText`、索引範圍及 limit 交給 [ChunkRepository](../src/Infrastructure/Persistence/Repositories/chunk.repository.ts) 的 `findByDocumentIndexIdsOrderByLexicalScoreDescAndIdAsc`。Repository 使用純 `LexicalSearchQueryAdapter` 產生搜尋詞；空索引、分詞後空集合或非正 limit 回傳空集合，有效輸入仍拋出 `LexicalRankingUnavailableException`，沒有執行 DB 查詢。此邊界調整讓查詢表示與儲存 `searchVector` 使用相同 Adapter；固定拋錯仍是未完成的功能阻塞，不代表已提供資料存取能力。

[FindRetrievalChunkCandidatesUseCase](../src/Application/Chunks/UseCases/find-retrieval-chunk-candidates.use-case.ts) 先執行 lexical，再執行 vector，因此有效 lexical 輸入會在 vector 查詢前中斷。帶搜尋詞的 hybrid retrieval 尚未完成。Chunks 結構已獲使用者確認，不等於這個缺口已通過功能驗收。

## 能力缺口與方案邊界

本次已核對的 TypeORM 原生查詢 API 未提供所需的全文匹配、relevance 投影與排序組合。不能為此重新引入 Sequelize、一般 QueryBuilder、隱藏 SQL 的 helper，或將全量資料載入記憶體再排名。

後續優先核對實際安裝版本是否有能完整表達同等語意的原生 API；若沒有，最小方案是另外提出僅限 Chunk 全文候選查詢的參數化 SQL 例外，交由使用者決定。這項全文例外目前尚未獲准，也未實作。不得從向量例外推導全文授權。

若方案獲准，DB 存取仍歸同一 ChunkRepository，輸入為具名 QO（原始 `queryText`、索引範圍與 limit），結果在 Infrastructure 經 Factory 還原為具有合法 lexical evidence 的 `Chunk[]`；不新增平行 Reader／Repository，也不回傳 `{ chunks, scores }`、row 或 DTO。UseCase 決定候選政策，Assembler 僅整理已選候選的中間資料。

內部 lexical evidence 目前以原始 `queryText` 精確對應本次查詢；不能把分詞後相同但原文不同的查詢互換。這不改外部 HTTP 回應 shape，也不表示舊 `terms` evidence API 保持來源相容。

## 完成條件

- 有效輸入確實查詢 DB，依有效 document index 範圍隔離資料。
- 在 DB 執行全文匹配、relevance 降冪、同分 ID 升冪與 limit。
- 沿用同一 DataSource 的 active read transaction，維持候選與後續 context 的 snapshot 一致性。
- Repository／UseCase 回傳 Domain Entity；不移除既有 Entity 驗證、排名證據與錯誤檢查。
- [真實候選整合測試](../tests/Integration/Persistence/native-retrieval-chunk-candidates.test.ts) 及完整 hybrid 行為通過。只測空輸入或預期拋錯不算完成。

2026-10-16 Adapter 邊界調整已通過 144 個定點單測，以及 Repository 寫入與舊 formatter 路徑的 `searchVector` 實際 DB 讀回對照；該 DB 對照不驗證全文匹配或排名。完整驗證與其他限制見 [狀態與驗證](TODO.md#目前狀態與驗證)。
