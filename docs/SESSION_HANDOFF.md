# RAG Service 新 session 接手

更新：2026-10-14。這是**交接入口與當前狀態**；[TODO](TODO.md) 保留 Draft v4 的完整工作與驗收清單。開始前先重新確認 Git 工作樹和驗證結果，不能把歷史通過紀錄當作目前修改的通過證據。

<!-- continuation-20261014:start -->

## 2026-10-14 原始 coding 修正進度

依使用者最新指示，直接完成原始 coding 修正與完整檢查；本輪已取消正式 review。endpoint／runtime／smoke／資料清理工作仍待原始 coding 完成後再執行。

- 六個 coding agent 沿用原任務分批執行：retry、DI/provider boundary、replacement rollback 測試、retrieval、lifecycle/fencing、retention/GC；最多同時執行三個 coding agent。
- 六份 coding 已全部完成：retry、DI/provider、replacement rollback 測試、retrieval、lifecycle、retention。各份 scoped 測試有重疊，完整 scripts 的實際結果另列於下方。
- retry 已修正 archive context 的 hash 契約，並移除 Request 的 `for`；28 項單測、7 項隔離資料庫案例與 scoped 檢查通過。relation repository 已移除無 caller 的舊替換方法，儲存改明確欄位 mapping；相關 22 項測試與 scoped 檢查通過。
- retrieval 候選去重與排名移至真正 Retrieve UseCase，repository 只回傳單模型查詢事實；固定兩 hop 展開、scope-before-LIMIT、TopK 後 context 保留。scoped 46 項單測、1 項隔離資料庫案例通過。
- lifecycle 移除 Infrastructure facade 呼叫 Application Fail UseCase 的反向編排；Process 直接注入 Fail UseCase，claim 使用有限掃描預算及循序鎖定。scoped 47 項單測、11 項隔離資料庫案例通過。GC/prune 改具名循序步驟，scoped 12 項單測、3 項隔離資料庫案例通過。
- replacement 新增 15 項單測及 6 項隔離 PostgreSQL 案例，涵蓋 wrong token／expired lease／stale generation／READY 保護，以及實際刪除舊資料、寫入新 chunk／relation 後觸發 PostgreSQL CHECK 失敗，確認舊資料與 ID 完整回滾。
- production `for`／`while`、舊 `replaceForIndex`／`findHybridCandidatesIn`／`workflow.fail` 已無搜尋結果。retry context 的同一 transaction client 並行讀取已改循序 await；最新完整整合測試通過，未出現並行 client query 的 deprecation warning。
- 最新 lifecycle 修正：Complete／Replace／Fail 在取得鎖後用當下時間檢查 lease，不採用呼叫端回填的結果時間；補過期 lease／backdated timestamp 拒絕、terminal failure archive/delete rollback，以及真正 RetrieveUseCase 排名驗證。
- 最新完整 `npm run check` 通過（lint、format、typecheck、build）；`npm test` 182／182 通過；`npm run test:integration` 19／19 通過，兩套均 0 failed／cancelled／skipped。整合測試使用隨機隔離 `test_` schema，未操作應用程式 `public` 資料。證據：`/private/tmp/rag-direct-repair-check.log`、`/private/tmp/rag-direct-repair-unit.log`、`/private/tmp/rag-direct-repair-integration.log`。HTTP 與 PostgreSQL 測試因 sandbox 禁止 localhost listen／connect，以已授權的本機執行重跑通過。
- 本輪修改前的 153／153 單測與 6／6 integration 紀錄僅為歷史證據：`/private/tmp/rag-original-coding-{check,unit,integration}-final.log`，不替代上列最新結果。
- 使用者明確要求「不需要 review，直接改」；Standards／Spec agent 已中止，Grok CLI 已中止（exit 130），本輪不要求 review 產物。此次提交範圍為原始 coding 修正、回歸測試與本交接記錄；不包含使用者維護的 `AGENTS.md`。
- 先前 migration roundtrip（10 up/down/up、9 tables）已通過，schema 已清除；這是歷史環境證據，不替代最新 coding 驗證。
- endpoint 設定、真實 provider、Docker API/worker 與 Agent-Teams adapter smoke、exact18 public fixture cleanup 均延後至原始 coding 品質門禁及 commit 完成後。
- 真實模型 External／Full Plan、資料 cutover／recovery／GC apply 是獨立驗收門禁，仍待執行。受控 smoke 不構成這些門禁通過證據。

下方 2026-10-13 的失敗與中間結果保留作歷史記錄；最新狀態以本段及實際執行證據為準。
<!-- continuation-20261014:end -->

## 先讀與比較基準

1. 完整閱讀本服務的 [AGENTS.md](../AGENTS.md)，再依其索引閱讀 Obsidian [Agent-Teams/CONTEXT.md](/Users/xiang/Documents/Worker/BackEnd/Agent-Teams/CONTEXT.md)、`CODING_STANDARDS.md` 及各層規範。**不得修改 `rag_service/AGENTS.md`**；它是使用者維護的檔案。
2. 閱讀 [TODO](TODO.md) 與已移入本服務的 Draft v4：[欄位／約束](../assets/diagrams/rag-database-schema.md)、[互動圖](../assets/diagrams/rag-database-schema.html)、[SVG](../assets/diagrams/rag-database-schema.svg)。本文件只記交接狀態，不重寫規範。
3. `rag_service` 分支 `codex/rag-service-cutover`，本次修改前 fixed point `54f3587033249313cc9edb6944629767313d44c8`；`agent-teams` 分支 `codex/jev-rd-checkpoints`，其 fixed point `f5b0541d40d625647c4c0086da8b57232c60b76d`。兩邊是**不同 repo、不同比較基準**。接手時核對分支與未提交變更，不重置使用者或其他 agent 的工作。

## 2026-10-13 交接記錄（歷史狀態）

- 服務邊界：RAG 的 schema、索引、worker、Hybrid 檢索和清理屬於 `rag_service`；`agent-teams` 經 `Infrastructure/External/RagService` 呼叫 HTTP。`knowledge_chunks` 的原建表 migration 已從 `agent-teams` 移除，毋須增加 drop migration。新庫 Draft v4 的九張表採逐表 migration。
- **歷史驗證**：隔離 Docker 的 DB／migration／API／worker 曾啟動並做過 adapter enqueue、retrieve、prune smoke；較早的 `rag_service` check／unit test 和 `agent-teams` 完整測試有通過紀錄。舊業務庫曾盤點 66 個 `knowledge_chunks`，抽樣 benchmark 尚非完整 Plan 或新服務同條件基準。這些結果早於目前共享工作樹的修改，不構成當前 PASS；如需原始 benchmark 證據，從 `agent-teams/docs/verification/rag-hybrid-benchmark/` 核對。
- **交接前未通過**：Application/Domain 新增具名 enum、Assembler input 與 Application-owned ports，該範圍 ESLint 通過；Persistence repository、ports、DI 尚未對齊，HTTP request／integration fixtures 的 `RagSourceTypeEnum` 型別也尚未修完。最近一次 `tsc --noEmit` 失敗，`npm test` 因編譯失敗未執行；目前沒有可宣稱通過的完整 service E2E。較早的 isolated integration 也曾在 `claim-next-concurrency`（預期 1、實際 0）失敗。接手後先排除型別與整合問題，再重跑門禁。
- 最新的 Standards／Spec 雙獨立 agent review 與 Grok 4.7 CLI 只讀 review **尚未取得正式結果**。先前 Spec finding 屬於關聯模型修正前的快照，須以目前實作重新 review；不能以舊 finding 的存在或消失推定通過。

## 接下來的順序

1. 完成共享工作樹中 Application contracts、Persistence repositories／DI、HTTP DTO／fixtures 的整合，修正 typecheck。核對 TypeORM 關聯與主查詢的 `with`，每個 model 的 Repository 只負責 query／transaction／lock／CRUD；運算與決策移至 UseCase，資料轉換放 Assembler／Factory。
2. 依 [TODO](TODO.md) 逐項驗證獨立 DB、Hybrid 範圍先過濾、文件級版本切換、共用索引、重試／租約、prune／GC。先前 review 提出的文件範圍洩漏、共享 ready index 被改寫、並行 generation、清理仍可檢索或誤刪共享資料、relation target 內容不足等，都是**待重新核對**的風險。
3. 在隔離的 `RAG_DB_SCHEMA` 執行實際 scripts：`npm run check`、`npm test`、`npm run test:integration`，再核對 migration down／重跑、Docker API／worker、`agent-teams` adapter 與完整 Plan。測試不得重建或清理應用程式 `public` schema。執行過的項目記命令、結果與環境；未執行不得打勾。
4. 本輪依使用者明確指示省略 review，直接修正已知 coding 缺陷並重新執行完整驗證後 commit。提交時勿納入使用者的 `rag_service/AGENTS.md`；不要把已中止的 review 記為通過。
5. 完整 Plan 的品質／耗時 baseline、真實資料搬移／回復、GC apply 等仍是獨立驗收。不要因隔離 smoke 通過而宣稱正式切換完成。

## 已授權的資料處理與 review

- 使用者已授權**限 `rag_service` 資料庫**的 prune／GC：transaction 內鎖定、確認無共享引用與有效 worker lease，再清理目標 membership 及專屬 jobs、failed jobs、relations、chunks、indexes，須有並行與回滾測試。授權不等於程式已完成或驗證通過。
- 使用者已授權按 [/private/tmp/rag-public-fixture-cleanup-manifest-20261013.md](/private/tmp/rag-public-fixture-cleanup-manifest-20261013.md) 的精確清單清理先前誤留在 `public` 的 18 筆測試 knowledge base；執行前須重新核對 ID、共享引用與有效 lease。**目前未確認已清理**。
- 使用者已授權 Grok CLI 信任 `rag_service` 目錄，並把 `rag_service`／`agent-teams` 的程式碼、TODO、規範提供給 Grok 作本次只讀 review。**授權不等於 review 已完成**。

## 文件用途

| 文件                                       | 用途                                          |
| ------------------------------------------ | --------------------------------------------- |
| [TODO](TODO.md)                            | Draft v4 完整待辦與驗收；未完成項保留未勾選。 |
| [錯誤紀錄](rag-service-agent-error-log.md) | 已發生的實作失誤與防重犯核對。                |

## 可貼到新 session 的任務

> 請先完整閱讀 `/Users/xiang/Desktop/rag_service/AGENTS.md` 指定的 Obsidian 規範，以及 `/Users/xiang/Desktop/rag_service/docs/SESSION_HANDOFF.md`、`docs/TODO.md` 和 Draft v4 schema。勿修改 AGENTS.md，勿重置兩個 repo 的既有工作。先完成原始 coding 的 retry、單模型 repository／retrieval、lifecycle 分層與循序處理、retention 及 replacement rollback 修正，再跑完整 check／unit／隔離資料庫 integration。使用者本輪明確取消 review，勿重啟正式 reviewer。Repository 僅做 DB 操作，遵守 ORM、逐表 migration、Domain Exceptions、具名 enum／interface、清楚命名及格式規範。最新完整檢查通過後 commit，勿納入 AGENTS.md；再繼續 endpoint、Docker／adapter、Full Plan 與資料門禁。過往快照不能當目前 PASS；精確區分未完成門禁與已授權但尚未執行的清理。
