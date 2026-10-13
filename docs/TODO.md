# RAG 獨立資料庫與 Hybrid 檢索待辦

新 session 的當前狀態、驗證門禁與接手順序見 [SESSION_HANDOFF](SESSION_HANDOFF.md)。本文件保留 Draft v4 的完整待辦；舊階段打勾不代表獨立微服務已通過驗收。

## 任務總覽

- [ ] **RAG 獨立資料庫與 Hybrid 檢索（Draft v4）**
  - 建立 9 張表、跨專案共用文件與索引 worker；保留全文上下文切割，加入混合檢索、增量更新及首次執行＋3 次自動重試。
  - 詳細執行順序、驗收與下一個 session 交接見下方「RAG 調整與下一個 session 交接」；先 migrate，再重建與驗收，確認新庫生效後才清理舊資料。

- [x] **舊階段：RAG 改為持久化向量資料庫（歷史完成；不代表本次獨立服務驗收）**
  - 將目前程序記憶體中的文件索引改為持久化儲存，保存文件分段、向量、來源連結與內容版本，服務重啟後可直接重用。
  - 依內容雜湊／版本增量更新；未變動文件不重複產生向量，修改或刪除文件時同步汰除舊資料。
  - 支援語意檢索，保留專案、任務、版本與適用規範的隔離條件；檢索結果必須能回溯原始文件。
  - 驗收：重啟後索引仍存在；語意相關但沒有相同關鍵字的內容可被找到；過期及不屬於該專案／任務的資料不會被取用。以實際 Plan 流程記錄檢索品質、索引／檢索耗時及送入模型的文件量。

## RAG 調整與下一個 session 交接

更新日期：2026-10-13。此章節保留 Draft v4 的完整驗收清單；目前實作與驗證狀態見[新 session 交接](SESSION_HANDOFF.md)。尚未通過的門禁仍保持待辦。

設計依據：**RAG Database Schema Draft v4**（9 張表），已移至獨立服務 `/Users/xiang/Desktop/rag_service`。以[互動草稿圖](../assets/diagrams/rag-database-schema.html)、[欄位與約束規格](../assets/diagrams/rag-database-schema.md)、[SVG](../assets/diagrams/rag-database-schema.svg)為準；下列待辦依其拆分，欄位細節不另複製一份。

交接時 `rag_service` 分支：`codex/rag-service-cutover`，本次修改前 fixed point：`54f3587033249313cc9edb6944629767313d44c8`。`agent-teams` 分支：`codex/jev-rd-checkpoints`，其 fixed point：`f5b0541d40d625647c4c0086da8b57232c60b76d`。接手時確認實際分支與工作樹，重新核對有變動的部分，不重設其他工作的變更。

### 目標與已確認方向

- 將 RAG 的儲存與索引負載從業務資料庫／請求流程中分離，保留同專案跨任務共用知識的行為。
- 建立獨立 PostgreSQL instance／服務中的 `agent_teams_rag`。第一版一個專案對應一個 `knowledge_base`，透過成員表跨專案共用文件、版本與相容索引。
- 每份文件獨立切換 `active_document_index_id`，不保存整個專案的歷史文件版本集合，也不等待全專案一起更新。
- 採 Hybrid RAG：關鍵字檢索與向量檢索合併，再利用有來源依據的文件關係補齊上下文。
- 保留模型閱讀完整文件、依主題與上下文決定 chunk 邊界的方式。不得退回 token／字數硬切；完整段落、清單、表格、程式區塊與目錄樹應保留語意完整性。
- 切割模型沿用 `RAG_CHUNKING_MODEL=gpt-6.1-sol`；它負責判斷邊界，與 embedding 模型是不同職責。
- 改善 Plan 的知識準備時間與規範覆蓋率。先前討論的效能百分比只是估算，尚未做 benchmark。

### 舊系統現況紀錄：與新草案分開核對

以下是前次盤點的舊系統行為，供搬移與回歸驗證使用；不表示新庫已實作。

| 項目 | 目前行為 |
| --- | --- |
| Chunk 產生 | 模型讀取全文 blocks，回傳 `chunkStarts`；系統依位置保存原文。token count 只作中繼資料。 |
| 檢索 | Query embedding、向量相似度與鄰接 chunks；尚未加入關鍵字與向量的混合排名。 |
| 規範上下文 | 已有文件引用解析、適用範圍／必要文件處理；Agent 知識準備也會附必要文件全文。 |
| 文件更新 | 下一次 RAG 查詢前重新讀取知識入口，依內容 SHA-256 判斷版本；產生 Plan 前也會經過這個流程。沒有儲存後立即同步的 watcher。 |
| 增量粒度 | 有變動的整份文件重新規劃 chunks 並產生 embedding；未變動且索引設定相容者重用。 |
| 索引範圍 | 專案入口引用到的適用／必要文件，不會自動掃描整個 Obsidian vault 或所有原始碼。 |
| 舊版本 | 正常增量更新把舊版本設為 `isEffective=false`，預設查詢排除；同版本重切才刪除該版本舊 rows 後替換。 |
| 共用範圍 | `public.knowledge_chunks` 是專案共用索引，沒有 `task_id`；task reset 不應清除共用知識。 |
| 規則分析／程式證據 | 尚未保存結構化規則、適用條件或程式符合／缺漏的查核結果；採 Hybrid／Graph 本身不會自動產生這些能力。 |

前次基準盤點時已完成舊庫的 migrate 與 chunks 重建。後續曾以 agent-teams 內建 RAG API／worker 在獨立 PostgreSQL instance 建立索引；這是拆出微服務之前的歷史驗證，不能視為目前 `rag_service` 的部署與驗收。未完成的切換門禁見本 TODO 與[新 session 交接](SESSION_HANDOFF.md)。本次已移除 `knowledge_chunks` 的程式模型與建表 migration，沒有新增 drop migration；既有資料庫中的實體表與資料須另行核對。

#### 目前狀態（2026-10-13）

| 狀態 | 已有證據／尚缺項目 |
| --- | --- |
| 歷史驗證 | 拆分前的獨立 RAG PostgreSQL 與 Draft v4 migrations 曾在本地 instance 啟用；`agent-teams-web` 20 份來源、有效索引及佇列曾核對。這是舊路徑的盤點數字，不代表新微服務已通過驗收。 |
| 微服務切換中 | RAG DB、migration、index worker、retry 與 GC 移交 `/Users/xiang/Desktop/rag_service`；此 repo 透過 `RAG_SERVICE_*` 設定呼叫 External HTTP API。新服務的完整驗證與部署尚待完成。 |
| 未完成 | 完整 Plan 同條件品質／延遲比較、嚴格負向查詢空回應、真正舊系統 baseline、人工重試及 GC `--apply` 的端到端驗收與回復流程；上述未完成前不得宣稱舊庫已退役或清理。 |

下方原始驗收清單中 `[ ]` 表示尚未完成或尚無該項的獨立證據；不要因單項 API／integration 測試通過而推定整個階段完成。

### 第一階段：實作主線

#### 1. 建立基準並落實草案中的待定參數

- [ ] 用相同專案、文件版本、模型與固定問題集，記錄現有向量檢索及完整 Plan 流程的基準。
- [ ] 問題集涵蓋中文規範、精確類別／UseCase 名稱、分層目錄、跨文件引用、專案例外與查無資料。
- [ ] 分開量測讀檔／版本檢查、chunk 規劃、embedding、檢索、上下文組裝與 Plan 模型時間，以及輸入 token 數。
- [ ] 區分索引未建立、文件剛更新、索引未變三種情境；記錄 p50／p95、樣本數與相關文件／規則覆蓋率。
- [ ] 明確記錄 repo／vault 的穩定 `source_key`、來源根目錄與路徑正規化規則；第一版文件改名依草案視為舊路徑移除、新路徑加入。
- [ ] 驗證實際 embedding 模型、版本與維度，將 `vector(d)` 的佔位值改成可執行 DDL。第一版整個服務採單一 active embedding profile／維度，不混用不同模型的向量。
- [ ] 選定並驗證中文分詞與 code identifier／路徑保留規則，固定 `lexical_profile`；全文索引採 PostgreSQL `tsvector` 與 GIN，不將其原生排名稱為 BM25。
- [ ] 定義要求最新資料時的等待／逾時回應、自動重試退避間隔、工作租約期限，以及失敗紀錄與未使用版本的保留期。

#### 2. 分離 RAG 儲存與負載

- [ ] 建立獨立 `agent_teams_rag` instance／服務、帳號、連線池與 migration 生命週期；任務、執行狀態與 Plan 保留在業務資料庫。只分 schema 或同 instance 下另建 database，不能宣稱已隔離 CPU／I/O 負載。
- [ ] 讓 RAG 查詢與索引 worker 使用同一新庫；以 `project_name` 邏輯對應業務專案，不建立跨庫 FK。專案改名保留 `knowledge_bases.id` 並更新名稱對應。
- [ ] 將昂貴的全文 chunk 規劃與 embedding 索引工作放到可獨立執行的 worker；Application UseCase 負責協調，外部模型與儲存由 adapter 實作。
- [ ] 更新新增／變更的本機環境設定、`.env.example`、README 與容器設定；驗證執行中的服務確實載入。

#### 3. 依草案建立 9 張表與資料約束

| 資料表 | 實作責任與驗收重點 |
| --- | --- |
| `knowledge_bases` | `project_name` 唯一；一專案一知識庫，改名保留 ID。 |
| `knowledge_base_documents` | 複合主鍵建立專案／文件多對多；保存 `is_entry`、`always_include_full_content`、`requested_generation` 與可空的 `active_document_index_id`。 |
| `documents` | 以 `source_type + source_key + source_path` 唯一識別來源文件；不同來源即使全文相同也不合併。 |
| `document_revisions` | 保存不可變的原始 Markdown 與全文 SHA-256；同文件、相同 hash 共用版本。 |
| `document_indexes` | `revision_id + pipeline_hash` 唯一；保存模型與各處理 profile、`building / ready / failed` 及 `ready_at`。 |
| `chunks` | 保存原文、標題階層、ordinal、block 區間、向量與全文搜尋值；跟隨共用索引，不逐專案複製。 |
| `document_relations` | 保存來源索引、原始引用／anchor、目標提示、關係種類與原文證據；擴展時重新核對專案範圍。 |
| `jobs` | 單一專案文件的待執行／執行中工作、generation、重試次數、排程與領取憑證。 |
| `failed_jobs` | 保存耗盡重試的工作；原 job 已刪除，人工重試可追溯原紀錄。 |

- [ ] 依 Draft v4 完成各表欄位、型別、NULL／DEFAULT、唯一鍵與 FK；共用內容表不加 `knowledge_base_id`。新庫重新產生 ID，不要求相容舊 `knowledge_chunks` 的 ID／欄位。
- [ ] 實作複合 FK，保證成員的有效索引、索引的 revision、工作的目標索引，以及人工重試的失敗紀錄都屬於正確文件／專案；`failed_jobs.job_id` 僅追溯，不 FK 到已刪除的 `jobs`。
- [ ] 以資料庫約束檢查 enum、SHA-256 格式、序號、block 區間、JSON 形狀及工作狀態／attempts／領取欄位的一致性；刪除受引用資料採 RESTRICT。
- [ ] 落實 revision、ready 索引及其 chunks／關係不可變；失敗紀錄除人工重試更新時間外不可變。成員角色與有效指標可更新，不原地改寫已發布內容。
- [ ] 建立 GIN、成員反向查詢、有效索引引用、關係端點、jobs 領取／回收及 failed_jobs 查詢索引，依草案完整核對；向量先採精確排序建立基準，再依規模評估 HNSW。

#### 4. 語意切割、跨專案重用與單文件啟用

- [ ] 建立完整 `pipeline_hash`：包含 chunking、embedding、lexical、relation 的模型／版本／策略／參數，以及會影響輸出的額外上下文。專案專屬 prompt 或上下文不同時產生不同索引，不僅以全文 hash 判斷可否共用。
- [ ] 沿用 `gpt-6.1-sol` 讀全文決定 `chunkStarts`，依合法 block 邊界保存原文；發布前驗證完整覆蓋、順序與語意單位。`token_count` 只供觀測／預算，前後 chunk 由同一索引的 `ordinal ± 1` 取得。
- [ ] 同一 revision 與 pipeline 已有 ready 索引時直接重用，不呼叫 chunk 模型或 embedding；沒有變更時不新增重複工作。
- [ ] 用資料庫層級索引鎖協調跨專案共用建置，只允許持有有效憑證與建置鎖的 worker 寫入；重試重新驗證進度，避免多個 worker 競寫或刪除別人的未完成輸出。
- [ ] 完整生成 chunks、相容 embedding、全文索引與有證據的關係後，才能標為 ready；合法空文件允許零 chunks。部分輸出不得供檢索或當作成功索引。
- [ ] 成功時在同一 transaction 鎖住成員、確認工作仍存在、generation 最新、租約有效及索引符合目標，再切換 `active_document_index_id` 並刪除 job；失敗保留舊完整索引，首次失敗維持未就緒。

#### 5. jobs／failed_jobs 與固定重試規則

- [ ] 參考[既有 database-schema](../../agent-teams/assets/diagrams/database-schema.html)沿用 `attempts`、`reserved_at`、`idempotency_key`、`payload`、`execution_state`、`execution_verification` 與 `retry_payload` 命名；使用新庫 uuid／timestamptz／jsonb，不帶入業務任務專用欄位。
- [ ] `jobs` 僅有 queued／running，成員最多一筆未完成工作。相同目標去重；不同目標鎖住成員、遞增 `requested_generation`、取消舊工作並建立新 ID，舊 generation 不得覆蓋新要求。
- [ ] 領取原子增加 `attempts`、寫入 `reserved_at` 及 `execution_verification` 的 `claim_token`／`lease_expires_at`；續租、進度、成功與失敗提交皆驗證目前憑證及有效租約。等待排程或共用建置鎖不增加次數。
- [ ] 固定首次＋3 次自動重試，最多共 4 次執行，不另設 `attempt_limit`。前 3 次失敗保留同一 `jobs.id`、記錄錯誤／可重用進度、清空領取欄位，透過 `available_at` 退避後回到 queued。
- [ ] worker 當機或租約逾期計入同一 4 次上限；回收程序鎖住工作並重新核對到期條件，防止過期 worker 續租或提交。
- [ ] 第 4 次仍失敗時，同一 transaction 寫入 `failed_jobs` 並刪除 `jobs`；失敗歸檔不保留 jobs row，不排第 5 次。一般查詢不得重新自動排入同一耗盡目標。
- [ ] 人工重試鎖住成員與失敗紀錄，驗證仍為最新來源／pipeline／generation、尚未重試且無其他未完成工作；以新 ID、新去重鍵、`attempts=0` 建立 job，連結 `retry_of_failed_job_id`，同一 transaction 更新原紀錄 `retried_at`／`updated_at`。保留原失敗紀錄，新的 job 重新適用首次＋3 次。
- [ ] 新要求取代或成員移除屬取消，直接移除 job，不歸入 failed_jobs；成功工作也不保留在這兩張表，完成結果由有效索引及 `ready_at` 查詢。

#### 6. Hybrid 檢索與上下文補齊

- [ ] 所有檢索入口取得經授權的知識庫，依 `project_name → knowledge_bases → knowledge_base_documents.active_document_index_id → document_indexes → chunks` 取資料；共用儲存不代表跨專案可見。
- [ ] 在同一唯讀 REPEATABLE READ transaction 讀取成員、角色、有效索引、候選與必要全文，取得內容後結束 transaction，再呼叫 Plan 模型；不可讀到同文件混合新舊索引。
- [ ] 向量與全文檢索使用相同成員／有效索引／適用範圍；先限制有效範圍再選候選，避免全庫取少量 Top K 後才過濾。查詢 embedding 與 lexical 處理須相容於有效索引的 profile。
- [ ] 使用 RRF 融合兩條候選排名、去重並限制數量，不直接相加不同尺度的原始分數；驗證中文、精確名稱及語意查詢。
- [ ] 保存 `references / requires / applies_to / overrides` 與原文 evidence。一般 wikilink 只能產生 references，其餘關係須有明確來源依據，不可猜測。
- [ ] `target_document_id` 僅為解析提示；依同次查詢的專案成員與有效索引解析原始引用／anchor，只展開唯一可解析且就緒的目標。缺失／歧義明確回報，不跨專案補找；限制深度、候選數並防循環。
- [ ] 按專案的 `always_include_full_content` 加入必要文件全文，保留規範優先序；必要文件尚未就緒時等待或明確失敗，不默默省略。預算選擇完整內容單位，不以 token 上限重切來源 chunks。
- [ ] 保留文件來源、revision／index ID、章節／block、命中方式與關係證據，使 Plan 上下文可追溯；按需補齊鄰接 chunks。

第一階段不加入完整 GraphRAG 的全域實體抽取、社群偵測或摘要表；是否加入 reranker，依品質與延遲實測決定。

#### 7. 文件更新、成員範圍與資料清理

- [ ] 保留查詢前檢查來源內容、pipeline 與入口成員範圍，提供可明確觸發及查詢進度的增量索引入口；不自動掃描整個 vault 或所有原始碼。
- [ ] 共用文件變更展開到所有使用專案的單文件 jobs；同一相容索引只建置一次，各專案獨立啟用。一般更新只處理受影響文件，未變動文件直接重用。
- [ ] 新增成員先驗證來源授權、以有效指標為 NULL 建立，完成後才啟用；角色調整立即生效，除非改變 pipeline 輸入，否則不重建 chunks。
- [ ] 來源刪除、改名、引用或適用範圍改變時重新核對成員；移除成員與取消其 job 必須同一 transaction，後續查詢立即排除該文件。依新範圍解析關係，不改寫 ready 索引的既有關係。
- [ ] 分開呈現偵測到變更、建置中、目前可用版本與更新失敗；要求最新規範時等待目標完成或回報失敗，不將仍可用的舊索引稱為最新。
- [ ] 依保留期先清理未被人工重試工作引用的 failed_jobs，再清理未被任何專案有效指標、jobs 或保留失敗紀錄引用的舊索引／chunks／關係及 revision；GC 與建置／啟用協調鎖，不刪建置中的輸出。
- [ ] 文件身分無任何成員、版本或關係引用才可刪除；專案移除文件與 task reset 不得清除別人仍使用的共用內容。新庫以有效指標判斷可檢索版本，未被使用與已實體刪除分開驗證。
- [ ] 若要文件存檔後就預先更新，再選定 watcher、排程或事件觸發；未接入前不宣稱即時同步。

#### 8. 先 migrate，再搬移／重建與切換

- [ ] 依專案約定維護原始 RAG migration，規劃新庫獨立的執行入口；不為已確認的 chunk plan 欄位另加 `AddContextualChunkPlan1726000026000`。migration 只處理 schema，不呼叫讀外部文件／模型的 Application UseCase。
- [ ] 確認新庫連線與 migration 狀態，先建立全部表、約束與索引，再以可重入流程搬移／重建；不得對業務資料庫全面 reset。
- [ ] 盤點舊 `public.knowledge_chunks` 對應的來源與專案成員，重新驗證文件身分、revision 與完整 pipeline；不能證明相容的舊輸出須重建，不直接標為 ready。
- [ ] 在實際 `agent_teams_rag` 核對 `chunks` 及其 revision／index／成員關聯、來源數、有效版本、切割模型與檢索結果；清楚區分舊庫 `knowledge_chunks` 與新庫 `chunks`，避免驗錯資料庫或只驗證測試庫。
- [ ] 完成下列功能驗收並確認查詢／worker 已使用新連線後，才清理舊庫 RAG 資料及退役舊存取路徑；記錄切換與回復方式，不清除業務任務、狀態或 Plan。

### 第二階段：規則與程式查核結果重用

這一階段另行實作與驗收，不把它當成第一階段 Hybrid 檢索的既有能力。

- [ ] 從文件保存可追溯的規則、適用條件與例外，保留原文位置及來源版本；不能只保存無證據的模型摘要。
- [ ] 設計規則與程式位置的對應、符合／缺漏／未查核狀態及證據；未查核不得視為符合。
- [ ] 查核結果綁定文件版本、程式內容版本與分析策略；未 commit 的程式變更也需納入失效判斷。
- [ ] 文件變更使相關規則／查核結果失效，程式變更只重查受影響範圍；任意 `.ts`／`.vue` 變動目前不會自動觸發這套能力。
- [ ] Plan 優先重用仍有效的分析與證據，另量測此階段節省的重複閱讀／查核時間。

### 驗收與交付

- [ ] 沿用 `DocumentChunker.chunkDocument` 驗證上下文、Markdown 與目錄樹完整性；沿用 `IndexProjectKnowledgeUseCase.execute` 驗證變更更新與未變重用。
- [ ] A、B 專案共用同一文件／revision／pipeline 時只有一份索引與 chunks；不同 pipeline 不誤重用。驗證來源身分、專案改名、不同必要全文角色與各自有效指標。
- [ ] 驗證語意、中文關鍵字與精確名稱的 Hybrid 品質，以及關係循環／缺失／歧義、無結果、範圍隔離與必要全文保留；不得以全庫 Top K 後過濾漏掉有效結果。
- [ ] 驗證首次未就緒、單文件原子切換、失敗保留舊完整索引、來源／pipeline 再次變更使舊工作失效，以及查詢期間更新不會混讀同文件的新舊內容。
- [ ] 驗證重試恰為首次＋3 次，途中成功即停止；第 4 次失敗原子歸檔且原 job 不存在，交易回滾不遺失工作。涵蓋逾期租約、重複領取／回收／歸檔、跨專案建置鎖與過期 worker 不可寫入。
- [ ] 驗證一般查詢不重排耗盡目標；人工重試使用新 ID／新次數、保留原失敗紀錄且同一紀錄只能排入一次，過時目標改走新索引流程。
- [ ] 驗證成員移除會取消工作、立即退出查詢；A 移除文件不影響 B，GC 保留其他專案／工作／失敗紀錄引用的內容，過保留期且無引用的舊 chunks 確實刪除；task reset 不清共用索引。
- [ ] 核對 9 張表的 FK／唯一鍵／CHECK 與不可變規則；資料庫測試使用隔離 schema，不重建應用程式的 `public`。
- [ ] 以相同基準比較完整 Plan 的時間與品質；檢索變快、token 變少與整體 Plan 變快分開報告，不以降低規範覆蓋率換取速度。
- [ ] 依實際 `package.json` 執行 `npm run check` 與 `npm test`；沒有實際執行的項目不標記通過。
- [ ] 實作完成依適用流程執行 fixed-point 的 Standards／Spec 雙獨立 agent review、修正與提交；保留各自的正式結果。
- [ ] 交付記錄包含生效設定、migration／資料搬移結果、測試／review 證據、效能結果與仍未完成的項目。

### 接手入口

先讀 [SESSION_HANDOFF](SESSION_HANDOFF.md) 取得目前狀態與下一步，再以本章節開頭連結的 Draft v4 為設計依據，按第一階段 1–8 的依賴順序執行；schema 建立後才索引，功能驗收後才切換與清理舊庫。下列程式入口是舊系統改造起點，路徑與責任須按當前工作樹重新核對。

先讀 [rag_service/AGENTS.md](/Users/xiang/Desktop/rag_service/AGENTS.md) 與 [CONTEXT.md](/Users/xiang/Documents/Worker/BackEnd/Agent-Teams/CONTEXT.md)，依修改範圍讀規範。已發現的實作失誤與復核項目記在 [RAG 搬遷錯誤紀錄](/Users/xiang/Desktop/rag_service/docs/rag-service-agent-error-log.md)。此 TODO 是 session 交接，不能取代專案規範。

| 責任 | 現有入口 |
| --- | --- |
| 文件範圍與引用 | [GetKnowledgeEntryUseCase](/Users/xiang/Desktop/agent-teams/src/Application/KnowledgeEntries/UseCases/get-knowledge-entry.use-case.ts) |
| 讀檔與內容版本 | [FileSystemProjectKnowledgeReader](/Users/xiang/Desktop/agent-teams/src/Infrastructure/External/ProjectKnowledge/Adapter/file-system-project-knowledge.reader.ts) |
| 業務文件同步至 RAG API | [SynchronizeProjectKnowledgeSourcesUseCase](/Users/xiang/Desktop/agent-teams/src/Application/KnowledgeRetrievals/UseCases/synchronize-project-knowledge-sources.use-case.ts)、[HttpRagServiceAdapter](/Users/xiang/Desktop/agent-teams/src/Infrastructure/External/RagService/Adapter/http-rag-service.adapter.ts) |
| 獨立服務的索引與 worker | [RequestRagIndexUseCase](/Users/xiang/Desktop/rag_service/src/Application/KnowledgeBases/UseCases/request-rag-index.use-case.ts)、[ProcessRagIndexJobUseCase](/Users/xiang/Desktop/rag_service/src/Application/KnowledgeBases/UseCases/process-rag-index-job.use-case.ts) |
| 獨立服務的 chunk 與 Hybrid 檢索 | [MarkdownChunkFactory](/Users/xiang/Desktop/rag_service/src/Domain/Knowledge/markdown-chunk.factory.ts)、[RetrieveRagUseCase](/Users/xiang/Desktop/rag_service/src/Application/KnowledgeBases/UseCases/retrieve-rag.use-case.ts) |
| 獨立儲存與資料表 | [各 model 的 Repositories](/Users/xiang/Desktop/rag_service/src/Infrastructure/Persistence/Repositories)、[逐表 migrations](/Users/xiang/Desktop/rag_service/database/migrations) |
| Plan 知識準備 | [GeneratePlanUseCase](/Users/xiang/Desktop/agent-teams/src/Application/Specs/UseCases/generate-plan.use-case.ts) |

下一個 session 可使用：

> 請依 [SESSION_HANDOFF](SESSION_HANDOFF.md) 的「可貼到新 session 的任務」開始，並用本 TODO 逐項驗收。既有業務庫資料與新服務狀態須重新核對；只有切換門禁有證據後才退役及清理舊庫。
