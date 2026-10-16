# AGENTS.md

先讀 Obsidian [Rag-Service/CONTEXT.md](../../Documents/Worker/BackEnd/Rag-Service/CONTEXT.md)，依索引讀取開發規範、環境注意事項與相關程式。

進場必讀與任務相關的記憶：

- 專案 [Rag-Service/MEMORY.md](../../Documents/Worker/BackEnd/Rag-Service/MEMORY.md)。
- [後端共用記憶](<../../Documents/Worker/BackEnd/Shared Memory.md>)。
- [Agent 操作記憶索引](<../../Documents/Worker/Shared/Agent 操作記憶索引.md>)，依本次操作讀取相關案例。

Vault：`~/Documents/Worker`。記憶入口與維護方式依 [共用文件維護規範](../../Documents/Worker/文件維護規範.md#記憶入口)。必要文件無法存取時回報缺失，不以推測替代規範。

開發與 review 須遵守 CODING_STANDARDS 引用的共用規範。驗證依實際 scripts 執行，未執行或失敗不得記為通過。純文件修改只核對內容與連結。

## Chunks 基準與讀取時機

修改或 review Chunks，以及將其標準套用其他 feature 前，必讀 [Chunks 基準](docs/CHUNKS_BASELINE.md) 與 [狀態與待辦](docs/TODO.md)。使用者已於 2026-10-15 確認 Chunks 並要求單獨提交；其他 feature 與共用依賴仍未完成 review，不因 Chunks 已確認就視為全部通過。各文件用途與閱讀入口見 [docs 入口](docs/README.md)。

Chunks 禁止 `for`、`for...of`、`for...in`，不得換成其他迴圈形式規避。集合操作依 Obsidian 共用規範，流程政策由 UseCase／Domain 負責，Assembler 只做純組裝。`src/Application/Chunks/**/*.ts` 與 `src/Domain/Chunk/**/*.ts` 由 ESLint AST 規則阻擋三種語法；修改門禁時須驗證三種違規樣本都被拒絕。禁止用 async `forEach` 或巨大 callback 取代清楚的流程。

## 背景工作與失敗紀錄

`jobs`／`failed_jobs` 是 Infrastructure 的工作執行與失敗持久化紀錄，Model 分別命名為 `JobModel`／`FailedJobModel`，不使用 `IndexJob`／`FailedIndexJob`，也不建立 Domain Job Entity 或 `Application/Jobs`／`Application/FailedJobs` feature。

背景工作由所屬業務 feature 的 `Events`／`Listeners` 承接，以業務行為命名，工作派送、執行、成功、失敗與重試的流程實作直接放在對應 Listener；不得另建 Job UseCase 再用薄 Listener 轉呼叫，也不得用 `FailJobListener` 等技術狀態作為功能名稱。Listener 可組合既有業務 UseCase。Worker 只負責程序生命週期、輪詢與事件交付；保留持久化工作、交易提交後交付、租約、冪等、重試及失敗紀錄。`jobs`／`failed_jobs` 是技術儲存，不建立 Domain Entity，也不在業務 `Contracts` 建立 Job／FailedJob Repository；Listener 所依賴的 Queue／Archive 技術能力抽象仍放在所屬 feature 的 `Contracts`，例如 `DocumentIndexes/Contracts` 的 `DocumentIndexExecutionQueue`／`DocumentIndexFailureArchive`；流程實作放在 `Listeners`，技術儲存實作放在 Infrastructure。這項歸屬不放寬一般業務 UseCase／Repository 的 Entity 回傳規範。

## TypeScript 原始碼 import 副檔名

指向內部 TypeScript 原始檔的相對 import／export（包含 `import type`）使用實際 `.ts` 副檔名，不以 `.js` 代稱來源。這是本專案可讀性約定；不是宣稱 Node ESM 的 `.js` 引用本身無效。

目前使用 Node ESM 與 TypeScript Node16 module／resolution，共用 tsconfig 的 `rewriteRelativeImportExtensions: true` 由編譯器將相對 `.ts` 引用改寫成輸出的 `.js`；build／test 設定須繼承。變更時須驗證 typecheck、build、測試與 Node 載入產物。

真實 JavaScript 檔、套件 subpath、資源 URL、dist／test 執行命令不做字串式全面替換。動態 import 與非相對 alias 另行核對解析行為；此選項不保證改寫任意字串。

## ORM 與向量查詢例外

本專案統一 TypeORM；一般 CRUD、關聯與交易遵守 Obsidian 原生 ORM 規範，不引入 Sequelize 或第二套 Model／連線。2026-10-15 使用者僅核准 Chunk 向量相似度查詢使用參數化 SQL。以下為本專案例外的唯一正文，Obsidian 與程式註解連回此處。

- 範圍限 [ChunkRepository](src/Infrastructure/Persistence/Repositories/chunk.repository.ts) 的 `findByDocumentIndexIdsOrderByVectorCosineDistanceAscAndIdAsc(chunkVectorSimilarityQO)`：指定索引範圍、動態 cosine distance、距離升冪、同距離 ID 升冪及 DB limit。距離越小越接近；排名與限制留在 DB。
- 沿用既有 TypeORM manager、同一 DataSource 的 active read transaction、ChunkModel 對應表及 ChunkRepository Contract。不得另建 Reader／Repository、Sequelize Model 或連線橋接。
- 方法與 QO 名稱明示 Vector；不使用 Raw／SQL／TypeOrm 作為公開契約標籤，也不把輸入向量誤稱為資料列等值條件。未來改成等價原生 API 不需改呼叫端名稱。
- SQL 鄰近註解須說明僅限向量查詢、原生 API 缺少動態距離投影／排序／limit 組合，並連結本節或 Obsidian 的本節入口。名稱或註解本身不授權其他 SQL。
- 向量、ID、limit 使用綁定參數；資料表名稱只來自 ORM metadata 並由 driver escape。Infrastructure 將結果還原為合法 Domain Chunk Entity 後回傳，距離 evidence 遵守 Domain 驗證；不得外洩 row、DTO 或 scalar。
- 一般 CRUD、關聯、全文匹配／排名（包括 `ts_rank`、`plainto_tsquery`）、其他聚合、手寫 join、通用 SQL helper 與一般 QueryBuilder 均不在此例外內。缺少原生能力時明列阻塞及可審查方案，不以全量記憶體排名、固定拋錯或假空結果宣稱完成。
- 退出條件：實際安裝的 TypeORM 原生 API 能完整表達同等範圍、距離、排序與 limit，且行為驗證通過後，改回原生 API 並移除例外正文、入口摘要與程式註解。擴大例外須另有使用者明確同意。

全文檢索仍未完成，影響及完成條件見 [阻塞文件](docs/lexical-search-blocker-20261015.md)。
