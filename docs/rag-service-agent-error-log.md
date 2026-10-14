# RAG 服務本次任務的錯誤與修正檢核

此檔是本次 RAG 搬遷的任務紀錄，記錄已發現的 agent 失誤與復核項目；不寫入專案 `MEMORY.md`，不修改使用者維護的 `rag_service/AGENTS.md`。

## 已確認的錯誤

1. **未先讀完 Obsidian 規範就實作並宣稱符合。** 進場須從 `Agent-Teams/CONTEXT.md` 追到 `CODING_STANDARDS.md`、DDD 共用規範、Nest 分層、Config/Database、Coding Style、共用 TypeScript 格式規範，再以它們核對檔案。
2. **自行發明不在規範中的目錄。** `Application/Knowledge/Errors`、`Domain/Knowledge/Services`、`Infrastructure/External/Embedding/Adapters` 與規範不符。明確業務例外在 Domain `Exceptions`；業務編排由 Application `UseCases` 執行；External 使用單數 `Adapter`；HTTP filter 在 `Interfaces/Http/ExceptionHandlers`。不得只為了看似分層新增目錄。
3. **TypeScript 專案起始設定不完整。** 初版缺根目錄 `eslint.config.mjs`、`.prettierrc`、對應 `lint`/`format`/`format:check`、`tsconfig.build.json` 與 `exactOptionalPropertyTypes`、`noUncheckedIndexedAccess`。版本也未對齊本次參考的 `agent-teams` Node 26 / Nest 12 / TypeScript 5.9 設定。
4. **Docker 與參考專案、服務接線不一致。** 初版 `rag_service/Dockerfile` 用 Node 22，但 package engines 與 `agent-teams/docker/26/Dockerfile` 使用 Node 26；Compose 寫死資料庫密碼、將資料庫與 API port 對外綁定，RAG API 30700 又與 `agent-teams` 預設 30682 不一致；`.env.example` 的 `localhost:5432` 會在容器內指向自己，連不到 Compose `database`；缺 `.dockerignore`。RAG 資料庫要獨立且具 pgvector，修正時需確認映像相容與 API/worker 都用可連線的容器位址。即使改成 loopback，RAG 資料庫也不能佔用 `agent-teams` 已使用的宿主 30680，必須設獨立宿主 port 並同步更新文件。
5. **微服務啟動與 worker 接線須實證。** API 與 worker 應各自可啟動，設定在啟動時集中驗證，migration 能對獨立資料庫執行；不能只靠檔案存在或只靠 unit test 宣稱 Docker 可用。
6. **曾違反使用者檔案邊界。** `rag_service/AGENTS.md` 由使用者維護，此任務不得再修改；`knowledge_chunks` 應移除建立 migration，不新增 drop migration；資料列操作只能用 ORM，不寫 raw SQL row 操作；RAG migration 不混成單一 `CreateRagSchema`。
7. **留下泛用 `throw new Error(...)`。** `rag_service` 的 config、embedding adapter、repository 曾直接丟泛用錯誤；本次 RAG cutover 相關的 `agent-teams` 程式也有相同寫法。明確業務／應用失敗要定義於對應 `Exceptions` 目錄，由 HTTP ExceptionHandler 按型別映射；修正後對本次範圍重新搜尋，不能只改單一例子。
8. **搬遷邊界與測試未一起完成。** `agent-teams` 仍有本地 RAG 的索引、chunk 規劃與檢索程式，`docs/TODO.md` 仍指向已刪的 migration；舊測試可能靠殘留 `dist` 載入已移除原始碼。要逐一釐清一般 KnowledgeEntry 與 RAG 責任，移走 RAG 實作，更新接手入口，清潔 build 後驗證 External API 與獨立服務。
9. **Compose 設定沒有實際啟動驗證。** `rag_service/.env` 缺少 Compose 插值必需的 `POSTGRES_PASSWORD`，因此首次 `docker compose up -d database` 在建立容器前失敗。需補齊本機未追蹤環境設定，再執行資料庫、migration、API 與 worker 驗證；`docker compose config` 通過不能代替啟動。
10. **資料計算使用了不合規的 `for` 迴圈。** `rag_service` 的 Hybrid 融合與 cosine 計算、Markdown chunk／連結解析初版使用索引迴圈或 `for` 加 `push`，違反共用 Nest Coding Style「陣列與集合」規範。資料計算改用 `map`／`filter`／`reduce`；僅有須依序等待的副作用可保留 `for...of`，修正後須核對輸出順序與測試。
11. **跨服務 retrieval 回應格式未符合既有值物件序列化。** 實際 `HttpRagServiceAdapter.searchHybrid()` 收到 match 後，在 `deserializeMatch()` 將服務回傳的裸 64 位 hex `contentVersion` 交給 `ContentVersion` 驗證，觸發 `InvalidContentVersionException`，使 smoke 看似沒有命中。修正 `src/Application/Knowledge/UseCases/retrieve-rag.use-case.ts` 將版本序列化成 `sha256:<hex>`，並在 `tests/Unit/Application/retrieve-rag.use-case.test.ts` 加入格式回歸測試。使用實際 agent-teams adapter 重跑後，enqueue 成功、retrieve 得到 1 筆 match、prune 成功且後續 retrieve 為 0 筆；DB 查得該次 smoke project `memberships=0`、`ready_indexes=0`。首次 smoke 的測試斷言把 `DocumentReference` 值物件錯當字串，僅修正臨時 smoke assertion 讀取 `.value`，不屬 API 缺陷。


12. **原本缺少跨服務的專案授權邊界。** `rag_service` 不能只信任 HTTP payload 的 `projectName`，否則呼叫端可指定其他專案讀取共用索引。跨服務請求需驗證簽章與專案範圍，並測試拒絕偽造或跨範圍請求。
13. **未變動文件仍重複排入索引工作。** 同 revision、pipeline 的 ready 索引應直接重用；不得再次呼叫 chunk 模型或 embedding，也不得新增重複 job。跨專案共用 ready 索引要在資料庫交易中協調鎖與成員指標。
14. **清理流程曾忽略外鍵與共享引用。** prune／GC 的刪除順序必須符合 job／failed job／關係／chunk／index 外鍵，並在 transaction 中重新檢查其他專案引用與有效 worker lease；未通過實際資料庫測試前不可宣稱完成。先前的自動審核拒絕是歷史事件；使用者已明確授權限定 `rag_service` DB 的清理範圍與並行／回滾測試。授權不代表實作或驗證完成，詳見 [SESSION_HANDOFF](SESSION_HANDOFF.md)。
15. **命名與目錄再次偏離規範。** Application 使用單數 `Knowledge`，且多處使用 `base`、`doc`、`member`、`selected`、`fallback`、`state` 等承載業務狀態的模糊名稱。已改用 `KnowledgeBases` 目錄，其餘命名依具體語義逐檔修正，並以 lint/typecheck/unit test 驗證。
16. **分層 review 未攔住長 UseCase、Repository 業務計算與大型 Assembler。** 前輪成果將檢索選擇／關聯展開留在 `RetrieveRagUseCase`，將重試、目標狀態等判斷放在 TypeORM Repository；review 只追到部分功能與局部規範，沒有逐個 UseCase／Repository 核對責任。這輪搬移時又出現資料計算 `for` 與過度集中的 `RetrievalQueryAssembler`，表示先前糾正沒有落成明確驗收條件。先依專案 `MEMORY.md` 拆分並逐檔搜尋新增／修改的迴圈，再由獨立 Standards／Spec reviewer 與 Grok CLI 核對；未通過前不得宣稱架構收斂。先前 Luna 是否完整讀過 Obsidian 沒有可驗證的閱讀紀錄，不把推測寫成事實；本輪已要求 coding agent 先提供規範條文與行號。
17. **Repository 的 join 未逐一審核。** `typeorm-rag-document-index.repository.ts` 已以 `documentIndexIds` 篩選，卻在載入 revision、chunk、relation 與 lexical candidate 時反覆 join 回 index；`typeorm-rag-job.repository.ts` 的 `jobStatus()` 手寫 `knowledge_bases` 表名 join 篩選專案，並在同一方法計算 target state。`typeorm-rag-membership.repository.ts` 的多組跨表 join 也須逐一確認是必要資料篩選、關聯載入或應移到 Application Reader 的跨聚合讀取。先前 review 將「Repository 可以 query」當成通行證，未辨識冗餘 join、手寫關聯與業務運算混入。按專案 `MEMORY.md` 逐項審核與修正，不能機械式刪除導致專案範圍或檢索結果錯誤；目前尚未驗收。

## 收尾核對

- 逐項對照上面的具體路徑、Docker/Compose/.env、TypeScript 設定及啟動腳本，修正後再標記完成。
- 跑實際 scripts 與可執行的容器/資料庫驗證；未執行、失敗、受 sandbox 阻擋的項目明確記錄，不宣稱 PASS。
- 依 fixed point 進行獨立 Standards / Spec dual-agent review，另以 Grok 4.7 CLI review；本輪依使用者指示，review 後停止，不 commit。
