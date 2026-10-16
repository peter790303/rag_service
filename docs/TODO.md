# 狀態與待辦

更新：2026-10-16。本文件集中記錄目前狀態、未完成需求與驗收條件。共用規範依 [AGENTS.md](../AGENTS.md) 指定的 Obsidian 文件；已確認的 Chunks 實作見 [Chunks 基準](CHUNKS_BASELINE.md)。下列未勾選項均待核對，不代表尚無實作，也不代表已通過驗收。

## 目前狀態與驗證

- 分支：`codex/rag-service-cutover`。Chunks 基準已單獨提交為 `b76e225`；該版本當時仍依賴未提交的共用設定與其他 feature。
- 使用者於 2026-10-16 要求提交本次修正。提交範圍包含 Adapter／Exception 修正，以及它們相對 `b76e225` 必要的 feature 拆分、Events／Listeners、Queue／Archive、ORM 元件、DI、設定、migration 與測試前置；不能只提交本次差異而漏掉編譯及執行依賴。
- 提交與測試通過不代表全專案收斂已驗收；本次雙軸審查以修正前工作目錄快照為基準，未重新審查全部前置重構。
- Job／FailedJob 是 Infrastructure 技術紀錄，流程直接由業務 feature 的 Events／Listeners 承接；Queue／Archive 抽象仍放在 `DocumentIndexes/Contracts`。此歸屬已由使用者確認，不再列為待裁決的 Entity-only 衝突；一般業務 Repository／UseCase 仍遵守 Entity 回傳規範。
- `ChunkPlanningProvider` 與其失敗例外歸 Chunks。SHA-256／UUID 直接使用 Node API；純 lexical 轉換留在 Persistence Adapter，由 Repository 維護持久化表示；Exception 不因共用 HTTP 409 而繼承無關業務例外。

以下為 Adapter／Exception 修正後完整工作目錄的實際驗證。Node `v26.8.1`；DB integration 使用隨機 `test_<uuid>` schema，清理限該 schema。沒有把 sandbox EPERM、失敗或 skipped 記為通過。

| 項目                                                                                                     | 結果與限制                                                                      |
| -------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `npm run check`                                                                                          | 通過 ESLint、Prettier、typecheck、build；補齊 Adapter 回傳型別後再次通過。      |
| `npm test`                                                                                               | Unit／Feature 475／475 通過，0 skipped。                                        |
| `npm run test:integration`                                                                               | 35／38 通過，3 個既有 `LEXICAL_RANKING_UNAVAILABLE` 失敗，0 skipped；不是全綠。 |
| 新增 DB 行為驗證                                                                                         | 持久化 searchVector 相容性及 retry sentinel rollback 通過。                     |
| Standards／Spec 雙 agent review                                                                          | 本次差異兩軸 P1／P2／P3 均為 0／0／0；範圍與固定點見下方報告摘要。              |
| 真實模型、完整 Plan、migration roundtrip、Docker API／worker、Agent-Teams 整合及資料切換／回復／GC apply | 尚未完成本版本完整驗收。                                                        |

三個 DB 失敗案例為 `concurrent workers claim a queued job exactly once`、`document reference restricts vector candidates before the retrieval limit`、`public lexical candidate rankings retain database top-K, scores, complete projections and snapshot requirements`。前兩者在後續 retrieval 階段遇到同一全文檢索阻塞。測試維持真正功能預期，沒有改成期待拋錯或跳過。

475 項測試與 38 項 integration 的執行僅早於最後一項會被擦除的 TypeScript 回傳型別註記，執行期程式未變。完整記錄位於 `/private/tmp/rag-adapter-boundary-20261016/final-validation.md`。本次提交前已核對全部 `src`／`tests` 與審查凍結快照一致。

## 共用值與日期物件收斂（2026-10-16）

本項以先前 DTO 轉換修正的工作目錄快照為基準，與上方已提交的 Adapter／Exception 修正分開記錄；不代表全專案對齊已完成。

- 日期採單一 `DateTime` 值物件，歸 `Domain/Document/ValueObjects`。Document、DocumentRevision、DocumentIndex、Chunk、Membership 的時間點欄位共用有效性、不可變性、判等與明確表示；DTO／QO／ORM／HTTP 的欄位選擇及 payload 轉換仍留在各自邊界。
- 來源行號範圍採 `SourceLineRange`，歸 DocumentRevision；Chunk 與 DocumentRelation 單向依賴此值。座標為 0-based、結尾不包含，允許空範圍；Entity 保留既有對外數值 getter 與精準例外分類。
- 向量暫不合成單一值物件：Chunk 持久化值目前允許空陣列，query 與完成替換的向量要求非空，provider 回應還須符合設定維度。各自責任維持於 Chunk、KnowledgeBases 流程與 Infrastructure；須先明定未生成狀態，才另行評估非空 EmbeddingVector，不能將資料庫固定維度偷渡成共用規則。
- `DocumentRevision.contentSha256` 與 `DocumentIndex.pipelineHash` 分別識別內容與輸出設定，合法值與大小寫規則也不同，維持各自擁有者與字串契約；既有共用 pipeline serializer 沿用，不新增通用 Hash 包裝或 crypto Adapter。
- 沿用 `Domain/DocumentRelation/ValueObjects/document-reference.ts` 的 `DocumentReference` 引用正規化與判等，由 KnowledgeBases Application 單向使用。原始 relation reference 與外部 sourcePath 保留原值；相對引用需要來源目錄與連結種類，由使用流程解析後再建立 DocumentReference，不強迫不同路徑語意共用一個值。
- 共用值不依賴 Entity、Application、ORM 或外部套件物件；日期函式庫或內部儲存可在公開行為不變時替換，不新增空殼 Contract／Adapter，也不建立通用 Common／Shared 目錄。
- 本項實作與邊界遷移已完成。2026-10-16 本版本 `npm run check` 通過、Unit／Feature 498/498 通過，編譯產物的 Node ESM 載入通過；測試涵蓋無效日期、不可變性、同時間點判等、時區跨日、DST、五個 Entity 的原有例外、DTO／ORM 原生 Date 與 HTTP UTC ISO 相容性。
- 本版本整合測試實跑 35/38，0 skipped；三項失敗皆為既有 `LEXICAL_RANKING_UNAVAILABLE`，仍依 [全文檢索阻塞](lexical-search-blocker-20261015.md) 處理。本項完成不解除全文檢索或全專案對齊的未完成狀態。

## 本次執行順序

使用者要求先將整個專案其餘部分對齊已確認的 Chunks，再補齊未完成功能。下方功能需求清單不是跳過收斂步驟的授權。

### 步驟一：全專案對齊 Chunks

Documents、DocumentRevisions、Memberships、DocumentRelations、DocumentIndexes、KnowledgeBases 及配套 Infrastructure／Interfaces 已有實作與測試調整；仍須逐項核對最終版本的責任邊界與驗收證據。先前部分快照的審查結論不能自動套用後續 Listener 重構或其他變更，也不能因本次 Adapter／Exception review 通過而把全專案標為完成。

- [ ] 依 Chunks 基準逐一調整並 review Documents、DocumentRevisions、DocumentIndexes、DocumentRelations、Memberships、KnowledgeBases，不把全部 feature 視為一次通過。
- [ ] 盤點完整 src 與配套測試／設定，逐一記錄範圍與完成證據，不以此處列舉的 feature 當作掃描上限。Application、Domain、Infrastructure、Presentation 與共用元件均須檢查。
- [ ] 一併檢查各 feature 的 Providers、Controllers、Resources、Events、Listeners、Contracts 與測試；避免集中塞入單一檔案。跨 feature 經 UseCase，Repository 輸入為 QO、輸出為 Domain Entity，UseCase 維持 Entity 回傳，Resource 從 Entity 取得資料。
- [ ] 針對其他 feature 檢查命名、例外、集合組裝、交易與鎖定責任；Jobs／FailedJobs 是事件處理及持久化概念，不另立為 Entity feature。
- [ ] 收斂時維持現有行為與交易正確性；缺少功能先記錄，不以修正分層為名混入未授權的 SQL 或其他功能方案。Chunks 為已確認基準，不另行重設其架構。
- [ ] 全部範圍完成後執行適用的檢查、完整測試與 review，依證據更新本文件。明確區分既有功能阻塞與收斂造成的新問題；不能只完成 Chunks 相鄰檔案就宣稱全專案已對齊。

### 步驟二：補齊未完成項目

只有步驟一的全專案收斂完成並通過適用驗證與 review 後，才依依賴順序處理下列需求。第一步完成後可繼續已授權的補齊工作；若方案需要擴大既有例外或其他必要批准，先備妥具體方案再取得授權。

- [ ] 解決[全文檢索阻塞](lexical-search-blocker-20261015.md)，先明確確認實作方案，再完成 DB 行為驗證。目前合法詞彙查詢會在進入向量查詢前失敗，不能宣稱 Hybrid 檢索已完成。SQL 例外仍僅限已核准的向量查詢。
- [ ] 依下方功能需求與驗收條件補齊缺漏；已實作項目先核對證據，不以舊紀錄視為完成，也不重做已驗證且未變更的工作。
- [ ] 在完整依賴提交後，針對可重現的固定版本執行 check、Unit／Feature、隔離 DB integration、migration roundtrip、Docker API／worker、Agent-Teams HTTP 整合及完整 Plan 驗收。
- [ ] 核對[資料庫設計](../assets/diagrams/rag-database-schema.md)及衍生圖；目前以 `project_id` 識別專案，`project_name` 為顯示資訊，文件不得繼續描述成名稱識別。
- [ ] 完成後同步 Obsidian 的版本與驗證證據；未執行、失敗或舊版通過均不得記為目前 PASS。

## 第一階段需求與驗收

以下保留原始需求中仍需確認的行為，分層與命名均以目前規範及 Chunks 基準為準。需求需要的全文查詢能力尚受阻塞限制，不能以需求清單視為 SQL 授權。

### 基準、來源識別與參數

- [ ] 固定專案、文件版本、模型與問題集，建立完整 Plan 基準；涵蓋中文規則、精確 UseCase／class／目錄名稱、跨文件引用、例外與無結果情境。
- [ ] 分別量測讀檔、版本比對、chunk 規劃、embedding、retrieval、context 組裝及 Plan 的時間與 token；比較無索引、剛更新與未變更三種情境，記錄樣本數、p50／p95 與規則覆蓋率。
- [ ] 定義穩定的 `source_key`、來源根目錄與路徑正規化；重新命名依舊來源移除、新來源加入處理，不以顯示名稱作識別。
- [ ] 固定 embedding 模型、版本、維度與實際 `vector(d)` DDL；同一作用範圍只使用相容的 active profile。
- [ ] 驗證中文、程式識別字與路徑的 tokenizer／`lexical_profile`、全文索引及排名方案；不得把 `tsvector`／GIN 說成 BM25，也不得繞過全文檢索阻塞。
- [ ] 明定等待最新版的 timeout、retry backoff、lease 與 retention 參數。

### 獨立服務與儲存

- [ ] RAG 使用獨立 DB instance、帳號、連線與 migration 入口；Task／Plan 留在業務資料庫。同一 instance 只換 schema 不等於 CPU／資源隔離。
- [ ] KnowledgeBase 以 `projectId`／`project_id` 對應專案，改名保持識別不變；跨資料庫不建立 FK。
- [ ] chunk 規劃與 embedding 等重工作由事件／Listener 驅動的 worker 執行；UseCase 負責流程，外部模型 client 與持久化實作留在 Infrastructure，邊界資料轉換遵守 Adapters／Assemblers 職責。
- [ ] 驗證環境設定、README、容器 API／worker 與 Agent-Teams 呼叫端均使用實際載入的設定與新服務端點。

### Schema、約束與不可變資料

逐項對照[欄位與約束](../assets/diagrams/rag-database-schema.md)及實際 migration。持久化表名不直接決定 Application／Domain 的 feature 目錄。

| 資料表                     | 待核對責任                                                                |
| -------------------------- | ------------------------------------------------------------------------- |
| `knowledge_bases`          | 專案 ID 唯一識別；專案名稱僅供顯示。                                      |
| `knowledge_base_documents` | membership、entry／全文角色、requested generation 與可空的 active index。 |
| `documents`                | source type／key／path 與來源唯一性。                                     |
| `document_revisions`       | Markdown、SHA-256 與不可變 revision。                                     |
| `document_indexes`         | revision／pipeline hash、profiles、狀態與 ready 時間。                    |
| `chunks`                   | 原文、heading、ordinal、block、token、vector 與 lexical 資料。            |
| `document_relations`       | 原始引用、anchor、target hint、關係類型及原文證據。                       |
| `jobs`                     | 排隊／執行中、generation、claim、lease 與重試狀態。                       |
| `failed_jobs`              | 耗盡重試後的封存與手動重試追蹤。                                          |

- [ ] 驗證九表欄位、unique、FK、CHECK、enum、hash、ordinal／block 範圍、JSON、claim 條件與 RESTRICT；內容表不綁 KnowledgeBase，使用新資料模型 ID，不以舊 ID 相容替代搬移。
- [ ] 複合 FK 防止跨文件／專案的錯誤 active index；`failed_jobs.job_id` 只保留追蹤資訊，不要求原 job 仍存在。
- [ ] revision、ready index 及其 chunks／relations 不可變；failed record 除 `retried_at`／`updated_at` 等重試追蹤欄位外維持原始內容。
- [ ] 核對全文、反向引用、active pointer、relation、job／failed-job 索引；先驗證精確向量查詢基準，再評估 HNSW。

### Chunk 建置與版本啟用

- [ ] `pipeline_hash` 包含模型、chunk 策略及上下文等所有影響輸出的設定；專案採不同策略時不能錯誤共用索引。
- [ ] 驗證 `gpt-6.1-sol` 的 chunkStarts 規劃只切合法 block、依序完整覆蓋原文並維持語義；`token_count`、預算及 ordinal ±1 context 正確。
- [ ] 相同 revision／pipeline 的 ready index 可重用，避免重複呼叫模型；不同 pipeline 分別建置。
- [ ] 以 DB 建置鎖與有效 claim 識別防止重複建置、覆寫他人的結果或外洩半成品。
- [ ] chunks、相容向量、全文資料與 relations 全部完成後才可 ready；空文件有明確且合法的完成行為。
- [ ] 啟用前鎖定並核對 membership／job 仍存在、最新 generation、有效 lease 與正確 index；active pointer 切換及 job 刪除具原子性，失敗保留舊版本。

### 事件處理、重試與租約

- [ ] 核對 attempts、reserved_at、idempotency_key、payload、execution_state、execution_verification、retry_payload 及 UUID／timestamptz／jsonb 型別。
- [ ] 每個 membership 至多一個 queued／running job；相同目標去重，不同目標遞增 generation 並取消／取代舊工作。
- [ ] claim 才增加 attempts，設定 reserved_at、token 與 lease；所有後續寫入重新核對 claim。等待別人的建置時不佔鎖，也不誤增 attempts。
- [ ] 初次加三次重試，最多四次；前三次失敗沿用原 job ID、套用 backoff 並清除 claim。
- [ ] crash／lease 到期可回收且計入四次上限；重新鎖定檢查，阻止過期 worker 回寫。
- [ ] 第四次失敗原子封存 failed job 並刪除原 job；不執行第五次，不自動重排耗盡工作。
- [ ] 手動重試鎖定 membership 與 failed record，確認最新來源／pipeline／generation、未重試及無其他工作；建立新 job ID／key，attempts 歸零並帶 `retry_of_failed_job_id`，原 failed record 只更新重試追蹤。
- [ ] 目標變更或 membership 移除可取消 job，不封存為執行失敗；成功啟用後可取得正確 active index／ready 時間。

### Hybrid 檢索與引用展開

- [ ] 依授權的專案 ID、KnowledgeBase 與 memberships 決定作用範圍，於一致的讀取 snapshot 取得 active indexes；送入 Plan 前關閉讀取交易。
- [ ] 在 TopK／limit 前完成 scope 過濾；vector 與 lexical 使用相容 profiles。依 RRF 融合名次，不直接比較不同量尺的原始分數。
- [ ] 驗證中文、精確識別字與語義問題的召回；無結果時不跨專案補資料。
- [ ] references／requires／applies_to／overrides 有原文證據；wikilink 本身只表示 reference，不憑空提升語義。
- [ ] target hint 只作提示；依原始引用及 anchor 解析同一 membership／snapshot 內唯一的 ready target。缺失或歧義明確呈現，不向外搜尋補齊；展開有深度、數量與循環限制。
- [ ] `always_include_full_content` 的角色優先序清楚；必要文件未 ready 時等待或失敗，不默默省略。預算以完整語義單位處理，不任意再切碎。
- [ ] 回傳可追溯的 document／revision／index／heading／block、匹配方式與 relation evidence；相鄰 context 不冒充排名候選。
- [ ] 第一階段不引入全域 GraphRAG／community summary；是否增加 rerank 由基準結果決定。

### 增量更新與清理

- [ ] 比對來源、pipeline、entry 與 membership 變化，提供明確增量狀態，不把每次查詢變成全量掃描。
- [ ] 共用文件變更會更新受影響專案的工作；相同 index 只建一次，各專案獨立啟用。未變更內容可重用。
- [ ] 新 membership 的 active index 可為空；角色變更立即生效，除非影響 pipeline，否則不重建內容。
- [ ] 刪除、重新命名、引用及作用範圍變更會重新核對 membership；移除 membership 與取消 job 原子執行，檢索立即排除，relations 按新 scope 解析，不修改 ready 原文。
- [ ] detected／building／available／failed 狀態可區分；要求最新版本時依規則等待或失敗，不把舊版本當最新。
- [ ] retention 先處理不再需要重試追蹤的失敗資料，再清理無引用的 index／chunks／relations／revision；GC 與建置協調鎖定，不刪 active 或仍建置中的資料。
- [ ] document 只有在無引用時才實體刪除；專案移除與 Task reset 不影響其他專案，無引用不等於已清理。
- [ ] 尚未接上的 watcher／排程不得描述為已有即時更新。
- [ ] 核對先前誤留於 `public` 的精確 18 筆測試 KnowledgeBase 是否已清理。既有清單位於 `/private/tmp/rag-public-fixture-cleanup-manifest-20261013.md`；目前未確認完成。執行前重新確認清單、共享引用與有效 lease，不能擴大成整個 schema 清理。
- [ ] 實際 prune／GC apply 前，完成鎖定、共享引用、有效 lease、並行及回滾驗證；先前授權與測試案例不等於資料已處理。

### 搬移與切換

- [ ] 使用獨立 migration 入口與逐表 migration；不在 migration 呼叫外部模型，也不重建業務 schema。
- [ ] 新庫九表與約束／索引驗證完成後才重建索引；重跑具冪等性，不以業務資料 reset 代替。
- [ ] 盤點舊 `knowledge_chunks` 的來源與 memberships，核對來源識別、revision 與 pipeline；無法證明相容時重建。
- [ ] 以實際 instance 的 chunks、關聯資料、版本、模型與查詢結果驗收；測試 DB 不能替代真實搬移證據。
- [ ] 查詢端與 worker 確認使用新連線且完整驗收後，才退役舊路徑；保留 Task／Plan，記錄回復方案與後續清理。

## 第二階段需求

- [ ] 規則、條件與例外保留原始來源及版本，不用缺乏證據的摘要取代。
- [ ] 規則與程式位置對照，區分通過、缺漏及未審查，附對應證據；未審查不等於通過。
- [ ] 結果綁定文件版本、程式版本與策略，包含未提交程式的影響；來源或程式變動使受影響結果失效。
- [ ] `.ts`／`.vue` 等程式變更的偵測與驗證須實際接線；未接線不能宣稱已有功能。
- [ ] Plan 重用仍有效的結果，分別量測檢索、token 與完整 Plan 耗時，不以犧牲規則覆蓋率換取局部加速。

## 完整版本驗收條件

- [ ] Chunk 規劃、索引建置與啟用測試涵蓋原文完整性、錯誤輸入、相同 pipeline 共用及不同 pipeline 分離、來源重新命名、全文角色與 active pointer。
- [ ] Hybrid 測試涵蓋中文、識別字、語義、循環／缺失／歧義引用、無結果、專案隔離及必要全文；不得先全域 TopK 再過濾。
- [ ] 版本／交易測試涵蓋未 ready 不外洩、失敗保留舊版、stale generation、並行讀取、錯誤 claim、過期 lease 與共享 ready index 不可覆寫。
- [ ] 重試測試涵蓋恰好四次、archive／delete 回滾、到期回收、重複 claim、建置鎖及過期 worker；手動重試使用新 ID／零次數且只重試一次，保留原失敗證據。
- [ ] 移除與 GC 測試涵蓋取消工作、立即排除、保留其他專案引用、實體刪除條件及 Task reset；隔離 schema 測試不得重置或清空應用程式 `public`。
- [ ] 九表 unique／FK／CHECK／不可變條件與 migration up／down／up 通過；記錄命令、固定版本、環境與結果。
- [ ] 完成真實 provider、Docker API／worker、Agent-Teams 整合及完整 Plan 品質／耗時基準；較早版本或局部 smoke 不替代本次門禁。
- [ ] 依實作任務適用的流程完成固定版本 review，保留要求的 Standards／Spec 產物；本次 Adapter／Exception review 不代表所有前置重構都已完成同版本審查。
- [ ] 交付設定、migration、資料搬移／回復、測試、review、效能證據與剩餘限制，更新本文件及 Obsidian。

## Standards

本次差異基準為修正前快照 `5c6f2733dd17914e558c8297c5761220208d0d1b`，修正後固定點為 `b118c7df8b5fe4e6e8d332fe672d01fc1a783edc`，位於隔離 repository `/private/tmp/rag-adapter-boundary-20261016/review-repo`；它們不是本工作分支的產品提交。範圍為 76 個 repository 路徑與 2 份 Obsidian 規範參考。

獨立 Standards reviewer 的最終 P1／P2／P3 為 0／0／0。首輪缺少 Adapter 明確回傳型別的 P3 已修正並重新核對。這份審查涵蓋 Adapter／Contract 責任、lexical Repository 邊界及具名例外語意，不代表相對 Git HEAD 的全部前置重構已重新通過審查。

## Spec

同一固定點的獨立 Spec reviewer 最終 P1／P2／P3 為 0／0／0。本次差異未確認新增回歸；retry 初始拒絕順序、鎖定後失敗回滾、HTTP 明確錯誤碼，以及 lexical 持久化表示保留實際驗證。全文檢索排名阻塞仍存在，SQL 授權仍僅限向量查詢。

兩位 reviewer 檢查程式及已提供的驗證紀錄，沒有自行執行測試。完整原文分別位於 `/private/tmp/rag-adapter-boundary-20261016/standards-review.md`、`spec-review.md`，彙整於 `review-result.md`；本文件只記錄適用範圍與結論。
