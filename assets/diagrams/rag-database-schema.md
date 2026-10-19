# RAG Database Schema

> 定義核對：2026-10-19；程式基準 `71f401aa35e878fab54ad4dd8bfe7aaea552a265`。以已註冊 migrations 與 TypeORM Model 為依據，包含 **10 張表、104 個欄位、14 組實體 FK**。此處未驗證任何執行環境的 migration 套用狀態。

[互動結構圖](rag-database-schema.html) · [SVG 圖](rag-database-schema.svg)

## 讀取與責任邊界

- project_id → knowledge_bases → knowledge_base_documents → active_document_index_id → chunks / document_relations。
- documents 與 revisions / indexes 跨專案共用；每個專案成員各自維護有效索引與 requested_generation。
- jobs / failed_jobs 是 Infrastructure 的 JobModel / FailedJobModel 技術紀錄；document_index_success_receipts 保存成功工作的技術收據，不建立 Domain Job Entity 或 Application/Jobs feature。
- 業務事件、工作派送、執行、成功、失敗與重試流程屬於 DocumentIndexes/Events 與 Listeners；Worker 負責生命週期、輪詢與事件交付。
- DocumentIndexExecutionQueue / DocumentIndexFailureArchive / DocumentIndexSuccessArchive 抽象位於 DocumentIndexes/Contracts；ChunkPlanningProvider 位於 Chunks/Contracts。

## 資料庫約束與解讀方式

- 本圖以 migration 的實體 schema 為準，包含 10 表、104 欄、14 組 FK；所有 FK 的刪除行為皆為 RESTRICT。
- PK / UNIQUE 由 PostgreSQL 建立對應索引；下方另列 migration 明確宣告的一般與部分索引。
- TypeORM Model 關聯不等同實體 FK；DataSource synchronize: false，schema 變更透過 migration。
- DateTime / SourceLineRange 是 Domain Value Object，格式轉換與來源範圍驗證不新增獨立資料表；時間欄位維持 timestamptz。
- 這是程式定義稽核，未連線驗證任何環境的已套用 migration 或資料；也不代表搜尋功能與部署驗收已完成。

## 資料表

### knowledge_bases — 專案知識庫

以穩定 project_id 識別專案；名稱可變，成員表決定可讀文件與有效索引。

| 欄位           | 型別          | 約束／預設值                   | 意義                              |
| -------------- | ------------- | ------------------------------ | --------------------------------- |
| `id`           | `uuid`        | PK · DEFAULT gen_random_uuid() | 資料列識別碼                      |
| `project_id`   | `text`        | UNIQUE · NOT NULL              | 外部專案穩定識別；沒有跨資料庫 FK |
| `project_name` | `text`        | NOT NULL                       | 顯示名稱；不是唯一鍵              |
| `created_at`   | `timestamptz` | NOT NULL · DEFAULT now()       | 建立時間                          |
| `updated_at`   | `timestamptz` | NOT NULL · DEFAULT now()       | 更新時間；後續更新由寫入端維護    |

- UNIQUE(project_id)；專案改名不改變 identity。
- 文件內容可跨 knowledge_base 共用；讀取範圍由 knowledge_base_documents 管理。

### documents — 共用文件身分

來源定位決定文件身分；內容版本與索引產物分表管理。

| 欄位                 | 型別          | 約束／預設值                   | 意義                                 |
| -------------------- | ------------- | ------------------------------ | ------------------------------------ |
| `id`                 | `uuid`        | PK · DEFAULT gen_random_uuid() | 資料列識別碼                         |
| `source_type`        | `text`        | NOT NULL · CHECK               | repository / obsidian                |
| `source_key`         | `text`        | NOT NULL · CHECK length > 0    | 來源命名空間                         |
| `source_path`        | `text`        | NOT NULL · CHECK length > 0    | 來源內相對路徑                       |
| `current_title`      | `text`        | NULL                           | 目前文件標題                         |
| `unreferenced_since` | `timestamptz` | NULL                           | 進入無引用狀態的時間；供清理流程使用 |
| `created_at`         | `timestamptz` | NOT NULL · DEFAULT now()       | 建立時間                             |

- UNIQUE(source_type, source_key, source_path)；migration 另有 UNIQUE(id)，與主鍵重疊。
- documents 不直接持有 knowledge_base_id；成員表承接多對多關係。

### document_revisions — 不可變內容版本

保存文件內容快照；同文件相同內容雜湊共用 revision。不可變性由應用流程維護，migration 未建立禁止更新 trigger。

| 欄位             | 型別          | 約束／預設值                   | 意義                      |
| ---------------- | ------------- | ------------------------------ | ------------------------- |
| `id`             | `uuid`        | PK · DEFAULT gen_random_uuid() | 資料列識別碼              |
| `document_id`    | `uuid`        | NOT NULL · FK                  | 所屬 documents.id         |
| `content_sha256` | `char(64)`    | NOT NULL · CHECK               | 64 位小寫十六進位內容雜湊 |
| `title`          | `text`        | NULL                           | 此內容版本的標題          |
| `content`        | `text`        | NOT NULL                       | 完整來源文字              |
| `captured_at`    | `timestamptz` | NOT NULL · DEFAULT now()       | 來源快照取得時間          |
| `created_at`     | `timestamptz` | NOT NULL · DEFAULT now()       | 建立時間                  |

- UNIQUE(document_id, content_sha256)；UNIQUE(document_id, id) 支援索引的複合 FK。

### document_indexes — 內容索引版本

以 revision 與 pipeline_hash 定位可共用的索引產物；一個產物包含 chunks 與 document_relations。

| 欄位                   | 型別          | 約束／預設值                   | 意義                                          |
| ---------------------- | ------------- | ------------------------------ | --------------------------------------------- |
| `id`                   | `uuid`        | PK · DEFAULT gen_random_uuid() | 資料列識別碼                                  |
| `document_id`          | `uuid`        | NOT NULL · 複合 FK             | 與 revision_id 一起限制相同文件               |
| `revision_id`          | `uuid`        | NOT NULL · 複合 FK             | 來源內容版本                                  |
| `pipeline_hash`        | `char(64)`    | NOT NULL · CHECK               | 64 位小寫十六進位 pipeline 雜湊               |
| `chunking_model`       | `text`        | NOT NULL                       | 切塊模型版本                                  |
| `chunking_profile`     | `text`        | NOT NULL                       | 切塊設定版本                                  |
| `embedding_model`      | `text`        | NOT NULL                       | 向量模型版本                                  |
| `embedding_dimensions` | `integer`     | NOT NULL · CHECK = 384         | 目前 schema 固定 384 維                       |
| `embedding_profile`    | `text`        | NOT NULL                       | 向量設定版本                                  |
| `lexical_profile`      | `text`        | NOT NULL                       | 全文檢索設定版本                              |
| `relation_profile`     | `text`        | NOT NULL                       | 關聯抽取設定版本                              |
| `status`               | `text`        | NOT NULL · CHECK               | building / ready / failed / deleting          |
| `created_at`           | `timestamptz` | NOT NULL · DEFAULT now()       | 建立時間                                      |
| `ready_at`             | `timestamptz` | NULL · CHECK                   | ready 或 deleting 必須有值；其他狀態必須 NULL |
| `unreferenced_since`   | `timestamptz` | NULL                           | 進入無引用狀態的時間；供清理流程使用          |

- UNIQUE(revision_id, pipeline_hash)；UNIQUE(document_id, id) 支援同文件 FK。
- FK(document_id, revision_id) → document_revisions(document_id, id)。
- CHECK ((status IN (ready, deleting)) = (ready_at IS NOT NULL))。

### knowledge_base_documents — 專案文件成員與讀取角色

依 2026-10-19 使用者命名決定，此概念統一為 `KnowledgeBaseDocument`；Domain Entity 為 `KnowledgeBaseDocument`、Application feature 為 `KnowledgeBaseDocuments`、ORM Model 為 `KnowledgeBaseDocumentModel`、Repository 為 `KnowledgeBaseDocumentRepository`。資料表名稱與以下欄位保持原樣，不新增 migration。

連接專案與共用文件；每個成員保存自己目前啟用的索引與最新請求世代。

| 欄位                          | 型別          | 約束／預設值                     | 意義                                |
| ----------------------------- | ------------- | -------------------------------- | ----------------------------------- |
| `knowledge_base_id`           | `uuid`        | PK · NOT NULL · FK               | 所屬 knowledge_bases.id             |
| `document_id`                 | `uuid`        | PK · NOT NULL · FK               | 共用 documents.id                   |
| `active_document_index_id`    | `uuid`        | NULL · 複合 FK                   | 同文件的有效索引；尚未啟用可為 NULL |
| `requested_generation`        | `bigint`      | NOT NULL · DEFAULT 0 · CHECK ≥ 0 | 最新請求世代，用於拒絕過時結果      |
| `is_entry`                    | `boolean`     | NOT NULL · DEFAULT false         | 是否作為專案入口文件                |
| `always_include_full_content` | `boolean`     | NOT NULL · DEFAULT false         | 讀取時是否附加完整內容              |
| `created_at`                  | `timestamptz` | NOT NULL · DEFAULT now()         | 建立時間                            |
| `updated_at`                  | `timestamptz` | NOT NULL · DEFAULT now()         | 更新時間；後續更新由寫入端維護      |

- PRIMARY KEY(knowledge_base_id, document_id)。
- FK(document_id, active_document_index_id) → document_indexes(document_id, id)；FK 不檢查 ready 狀態，啟用資格由流程驗證。
- idx_kbd_document(document_id, knowledge_base_id)。
- idx_kbd_active_index(active_document_index_id) WHERE active_document_index_id IS NOT NULL。
- created_at 由 migration 定義並預設 now()；目前 KnowledgeBaseDocumentModel 未映射此欄，省略寫入仍由資料庫填值。

### chunks — 索引切塊與檢索資料

每個切塊屬於一個 document_index；來源座標與標題路徑支援檢索證據回溯。

| 欄位                | 型別          | 約束／預設值                   | 意義                                     |
| ------------------- | ------------- | ------------------------------ | ---------------------------------------- |
| `id`                | `uuid`        | PK · DEFAULT gen_random_uuid() | 資料列識別碼                             |
| `document_index_id` | `uuid`        | NOT NULL · FK                  | 所屬 document_indexes.id                 |
| `ordinal`           | `integer`     | NOT NULL · CHECK ≥ 0           | 索引內的切塊順序                         |
| `heading_path`      | `text[]`      | NOT NULL · DEFAULT {}          | 來源標題階層                             |
| `content`           | `text`        | NOT NULL                       | 切塊文字                                 |
| `block_start`       | `integer`     | NOT NULL · CHECK ≥ 0           | 來源範圍起點，歷史欄位名稱保留           |
| `block_end`         | `integer`     | NOT NULL · CHECK > block_start | 來源範圍終點，不包含終點                 |
| `token_count`       | `integer`     | NULL · CHECK ≥ 0               | 可選的 token 數量                        |
| `embedding`         | `vector(384)` | NOT NULL                       | 固定 384 維向量                          |
| `search_vector`     | `tsvector`    | NOT NULL                       | 全文檢索詞彙及位置；供 Hybrid 相關度排名 |
| `created_at`        | `timestamptz` | NOT NULL · DEFAULT now()       | 建立時間                                 |

- UNIQUE(document_index_id, ordinal)。
- idx_chunks_search_vector USING gin(search_vector)；目前 migration 沒有 HNSW / IVFFlat 索引。
- 向量相似度與 RAG Hybrid 全文匹配／排名各依 Obsidian CODING_STANDARDS.md 的限定 SQL 例外；不授權其他查詢。

### document_relations — 索引產生的文件關聯

關聯證據屬於 source_index；目標可先保留文字引用，解析完成後才填 target_document_id。

| 欄位                   | 型別      | 約束／預設值                   | 意義                                                                       |
| ---------------------- | --------- | ------------------------------ | -------------------------------------------------------------------------- |
| `id`                   | `uuid`    | PK · DEFAULT gen_random_uuid() | 資料列識別碼                                                               |
| `source_index_id`      | `uuid`    | NOT NULL · FK                  | 關聯來源 document_indexes.id                                               |
| `target_document_id`   | `uuid`    | NULL · FK                      | 已解析的 documents.id；未解析可為 NULL                                     |
| `target_reference`     | `text`    | NOT NULL                       | 原始目標文字引用                                                           |
| `target_anchor`        | `text`    | NULL                           | 目標內的錨點                                                               |
| `relation_type`        | `text`    | NOT NULL · CHECK               | markdown_link / wiki_link / references / requires / applies_to / overrides |
| `evidence_block_start` | `integer` | NOT NULL · CHECK ≥ 0           | 來源證據範圍起點                                                           |
| `evidence_block_end`   | `integer` | NOT NULL · CHECK > start       | 來源證據範圍終點，不包含終點                                               |
| `evidence_text`        | `text`    | NOT NULL                       | 支持關聯的來源文字                                                         |

- idx_relations_source(source_index_id)。
- idx_relations_target(target_document_id) WHERE target_document_id IS NOT NULL。

### jobs — Infrastructure 工作執行紀錄

保存尚待完成的持久化工作、租約與執行狀態；業務流程由 DocumentIndexes 的 Listener 承接。

| 欄位                     | 型別          | 約束／預設值                     | 意義                                                      |
| ------------------------ | ------------- | -------------------------------- | --------------------------------------------------------- |
| `id`                     | `uuid`        | PK · DEFAULT gen_random_uuid()   | 資料列識別碼                                              |
| `knowledge_base_id`      | `uuid`        | NOT NULL · FK / 複合 FK          | 工作所屬專案與成員                                        |
| `document_id`            | `uuid`        | NOT NULL · 複合 FK               | 工作所屬文件                                              |
| `document_index_id`      | `uuid`        | NOT NULL · 複合 FK               | 待建立或啟用的同文件索引                                  |
| `generation`             | `bigint`      | NOT NULL · CHECK > 0             | 此工作對應的請求世代                                      |
| `status`                 | `text`        | NOT NULL · CHECK                 | queued / running                                          |
| `attempts`               | `integer`     | NOT NULL · DEFAULT 0 · CHECK 0…4 | 已領取執行的次數；上限 4                                  |
| `available_at`           | `timestamptz` | NOT NULL · DEFAULT now()         | 最早可領取時間                                            |
| `reserved_at`            | `timestamptz` | NULL · CHECK                     | running 必須有值；queued 必須 NULL                        |
| `lease_token`            | `uuid`        | NULL · CHECK                     | running 必須有值；queued 必須 NULL                        |
| `lease_expires_at`       | `timestamptz` | NULL                             | 獨立租約到期欄；初始 migration 0008 建立；允許 NULL         |
| `idempotency_key`        | `text`        | UNIQUE · NULL                    | 非 NULL key 不得重複                                      |
| `retry_of_failed_job_id` | `uuid`        | NULL · 複合 FK                   | 手動重試的失敗紀錄來源                                    |
| `payload`                | `jsonb`       | NOT NULL · CHECK object          | 工作輸入                                                  |
| `execution_state`        | `jsonb`       | NULL · CHECK object              | 可選的執行進度或結果狀態                                  |
| `execution_verification` | `jsonb`       | NULL · CHECK object              | running 租約驗證；含 claim_token 與 lease_expires_at 字串 |
| `created_at`             | `timestamptz` | NOT NULL · DEFAULT now()         | 建立時間                                                  |
| `updated_at`             | `timestamptz` | NOT NULL · DEFAULT now()         | 更新時間；後續更新由寫入端維護                            |

- UNIQUE(knowledge_base_id, document_id)：每個成員最多一筆未完成工作。
- FK(knowledge_base_id, document_id) → knowledge_base_documents；FK(document_id, document_index_id) → document_indexes。
- 重試複合 FK(knowledge_base_id, document_id, document_index_id, retry_of_failed_job_id) → failed_jobs 同專案、文件、索引的紀錄。
- queued：attempts < 4，reserved_at / lease_token / execution_verification 為 NULL；running：attempts 1…4，三欄均非 NULL。
- execution_verification 的 CHECK 僅驗證 object 與兩個字串欄位；不驗證字串是有效 UUID / 日期，也不保證它們等於獨立租約欄位。
- lease_expires_at 不在原 lease-state CHECK 中；初始 migration 0008 建立此 nullable 欄位及 recovery index；執行端寫入到期時間，缺漏值由回收流程處理。
- idx_jobs_claim(available_at, created_at) WHERE status = queued。
- idx_jobs_recovery(reserved_at) WHERE status = running；idx_jobs_document_index(document_index_id)。
- idx_jobs_retry_failed(retry_of_failed_job_id) WHERE retry_of_failed_job_id IS NOT NULL。
- idx_jobs_status_lease_expiry(status, lease_expires_at, created_at, id)。

### failed_jobs — Infrastructure 最終失敗紀錄

封存已達執行上限的失敗與重試輸入；保留歷史，供人工重試流程使用。

| 欄位                | 型別          | 約束／預設值                        | 意義                           |
| ------------------- | ------------- | ----------------------------------- | ------------------------------ |
| `id`                | `uuid`        | PK · DEFAULT gen_random_uuid()      | 資料列識別碼                   |
| `job_id`            | `uuid`        | UNIQUE · NOT NULL · 無 FK           | 原工作識別；原 jobs 列會刪除   |
| `knowledge_base_id` | `uuid`        | NOT NULL · FK                       | 失敗所屬 knowledge_bases.id    |
| `document_id`       | `uuid`        | NOT NULL · 複合 FK                  | 原工作所屬文件                 |
| `document_index_id` | `uuid`        | NOT NULL · 複合 FK                  | 原工作所屬索引                 |
| `generation`        | `bigint`      | NOT NULL · CHECK > 0                | 失敗工作對應世代               |
| `attempts`          | `integer`     | NOT NULL · CHECK = 4                | 封存時已達 4 次執行            |
| `error_code`        | `text`        | NULL                                | 失敗分類                       |
| `error_message`     | `text`        | NULL                                | 失敗說明                       |
| `blocked_reasons`   | `jsonb`       | NOT NULL · DEFAULT [] · CHECK array | 阻塞原因列表                   |
| `retry_payload`     | `jsonb`       | NOT NULL · CHECK object             | 重新派送所需輸入               |
| `failed_at`         | `timestamptz` | NOT NULL · DEFAULT now()            | 最終失敗時間                   |
| `retried_at`        | `timestamptz` | NULL                                | 已使用人工重試入口的時間       |
| `created_at`        | `timestamptz` | NOT NULL · DEFAULT now()            | 建立時間                       |
| `updated_at`        | `timestamptz` | NOT NULL · DEFAULT now()            | 更新時間；後續更新由寫入端維護 |

- UNIQUE(job_id)；沒有 job_id → jobs.id 的實體 FK。Model 的邏輯關聯不改變此事實。
- FK(document_id, document_index_id) → document_indexes(document_id, id)。
- UNIQUE(knowledge_base_id, document_id, document_index_id, id) 支援 jobs 的同範圍重試 FK。
- idx_failed_jobs_lookup(knowledge_base_id, document_id, failed_at DESC)。
- idx_failed_jobs_document_index(document_index_id)。

### document_index_success_receipts — Infrastructure 成功工作收據

保留已完成工作的歷史目標與專案識別，供刪除 queue job 後查詢狀態；不代表目標索引仍為目前啟用版本。

| 欄位                     | 型別          | 約束／預設值         | 意義                                   |
| ------------------------ | ------------- | -------------------- | -------------------------------------- |
| `job_id`                 | `uuid`        | PK                   | 原工作識別；原 jobs 列會刪除           |
| `project_id`             | `text`        | NOT NULL             | 完成時的外部專案識別；保留歷史查詢範圍 |
| `knowledge_base_id`      | `uuid`        | NOT NULL             | 完成時的知識庫識別                     |
| `document_id`            | `uuid`        | NOT NULL             | 原工作所屬文件                         |
| `document_index_id`      | `uuid`        | NOT NULL             | 原工作完成的索引                       |
| `generation`             | `bigint`      | NOT NULL · CHECK > 0 | 原工作對應世代                         |
| `attempts`               | `integer`     | NOT NULL · CHECK 0…4 | 成功時已領取執行的次數                 |
| `execution_verification` | `jsonb`       | NULL                 | 原工作執行驗證                         |
| `completed_at`           | `timestamptz` | NOT NULL             | 成功收據寫入時間                       |

- job_id 為主鍵；無其他唯一鍵、FK 或額外索引，避免歷史收據阻擋業務資料清理。
- 各欄位由成功 Listener 的同一交易寫入；不從任意 ready index 推定或回填過去已刪除的工作。
- migration 0014 為 forward-only，down 保留成功收據；收據的清理期限尚未定義。

## 實體 FK

箭頭由參照表指向被參照表；複合 FK 同時約束專案、文件或索引的範圍。所有 FK 均為 `ON DELETE RESTRICT`。

| 參照欄位                                                                          | 目標欄位                                                             |
| --------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| `knowledge_base_documents(knowledge_base_id)`                                     | `knowledge_bases(id)`                                                |
| `jobs(knowledge_base_id)`                                                         | `knowledge_bases(id)`                                                |
| `failed_jobs(knowledge_base_id)`                                                  | `knowledge_bases(id)`                                                |
| `knowledge_base_documents(document_id)`                                           | `documents(id)`                                                      |
| `knowledge_base_documents(document_id, active_document_index_id)`                 | `document_indexes(document_id, id)`                                  |
| `document_revisions(document_id)`                                                 | `documents(id)`                                                      |
| `document_indexes(document_id, revision_id)`                                      | `document_revisions(document_id, id)`                                |
| `chunks(document_index_id)`                                                       | `document_indexes(id)`                                               |
| `document_relations(source_index_id)`                                             | `document_indexes(id)`                                               |
| `document_relations(target_document_id)`                                          | `documents(id)`                                                      |
| `jobs(knowledge_base_id, document_id)`                                            | `knowledge_base_documents(knowledge_base_id, document_id)`           |
| `jobs(document_id, document_index_id)`                                            | `document_indexes(document_id, id)`                                  |
| `jobs(knowledge_base_id, document_id, document_index_id, retry_of_failed_job_id)` | `failed_jobs(knowledge_base_id, document_id, document_index_id, id)` |
| `failed_jobs(document_id, document_index_id)`                                     | `document_indexes(document_id, id)`                                  |

## 工作狀態與流程政策

- 索引就緒後，Listener 驗證成員的最新 requested_generation 與索引資格，再切換該成員的 active_document_index_id；不宣稱整個專案一次原子切換。
- queued 領取後進入 running 並建立租約；執行次數從 1 到 4，亦即首次執行加最多 3 次自動重試。
- 前 3 次失敗重新排程同一 jobs.id；第 4 次最終失敗以交易封存 failed_jobs 並移除 jobs；成功啟用時在同一交易寫入成功收據及移除 jobs。
- 成功收據保存當時 project_id 及工作目標，允許完成後繼續查詢狀態；後續世代與成員移除不改寫歷史成功。尚未定義收據清理期限，需評估持續累積的容量。
- 人工重試建立新工作，attempts 從 0 開始，retry_of_failed_job_id 保留來源；失敗紀錄保留歷史。一次性重試與世代驗證屬於應用政策。
- 持久化派送、交易提交後交付、租約驗證、冪等與重試需由流程共同維護；FK / CHECK 本身不保證整個工作流程完成。

## 目前限制與來源

目前向量欄位固定為 `vector(384)`。RAG Hybrid 全文匹配及相關度排名已獲限定 SQL 授權；詞彙位置儲存與真實 PostgreSQL 排名仍須依行為測試驗證，不可由 schema 推論部署驗收已完成。變更維度、全文實作或清理政策時，需同步檢查程式、migration 與本頁。

- [Migrations（十一個初始 migrations：0000–0009 與 0014 成功收據）](../../database/migrations)
- [TypeORM Models](../../src/Infrastructure/Persistence/Models)
- [當前狀態與待辦](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CONTEXT.md#驗收邊界與後續工作)
- [ORM 與向量查詢例外](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#orm-與向量查詢例外)
- [RAG Hybrid 全文 SQL 例外](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md#rag-hybrid-全文匹配與相關度排名)
