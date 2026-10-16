# Chunks 實作基準

使用者於 2026-10-15 確認 Chunks 可提交，並指定其他 feature 後續依此標準調整。基準 commit：`b76e225`。當時只提交 Chunks，共用設定與其他 feature 依賴保留未提交，因此該 commit 不是可獨立建置的完整版本。2026-10-16 使用者已要求隨後續修正一併提交必要前置；目前提交範圍與驗證限制見 [狀態與待辦](TODO.md#目前狀態與驗證)。

本頁用來定位已確認的實作及 review 重點。規範正文見 [Obsidian 開發規範](/Users/xiang/Documents/Worker/BackEnd/Rag-Service/CODING_STANDARDS.md)，專案例外見 [AGENTS.md](../AGENTS.md)。Chunks 的結構確認不等於全文檢索已完成。

## 資料與責任路徑

```text
輸入 DTO → UseCase 編排／Domain Entity 驗證
         → Assembler 組裝具名 QO → Repository 執行資料存取

ORM Model／允許的向量 row → Persistence Factory 還原 Chunk
                        → Repository 回傳 Chunk[] → UseCase 回傳 Entity
                                                   → Resource 從 Entity 白名單取值
```

寫入 QO 的內容必須來自經 Domain Entity 驗證的合法狀態。DTO 可作為輸入與內部中間資料，不作為 Repository／UseCase 的對外讀取結果。無結果的寫入回傳 `void`，HTTP 狀態由 Interfaces 處理。

| 檢查範圍        | 基準入口與核對重點                                                                                                                                                                                                               |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Entity 歸屬     | [Application/Chunks](../src/Application/Chunks)、[Domain/Chunk](../src/Domain/Chunk)：Application 複數、Domain 單數；工作流程歸所屬 Entity 的 Events／Listeners，不能因有 jobs 資料表就建立 Jobs feature。                       |
| Domain Entity   | [chunk.ts](../src/Domain/Chunk/chunk.ts)：身分、不變條件與 Entity 行為；ValueObjects 承載有驗證的值語意，不能充當 helper 收容區。                                                                                                |
| Repository 契約 | [chunk.repository.ts](../src/Application/Chunks/Contracts/chunk.repository.ts)：只收用途明確的 QO，讀取回傳 Chunk；命名表達條件、固定排序與向量用途。                                                                            |
| 資料存取        | [Repository 實作](../src/Infrastructure/Persistence/Repositories/chunk.repository.ts)：原生 TypeORM、交易所屬 manager、必要持久化檢查與 Entity 還原；不做候選政策、聚合或輸入集合整理。                                          |
| 持久化還原      | [ChunkFactory](../src/Infrastructure/Persistence/Factories/chunk.factory.ts)：Model 還原 Entity；向量結果解析留在 Infrastructure，不外洩 row／DTO。                                                                              |
| 跨 feature      | [ReplaceIndexChunkUseCase](../src/Application/Chunks/UseCases/replace-index-chunk.use-case.ts)：經對方公開的 UseCase Contract 呼叫，不直接取得其他 feature Repository。                                                          |
| 純資料組裝      | [QueryRetrievalNeighborChunkAssembler](../src/Application/Chunks/Assemblers/query-retrieval-neighbor-chunk.assembler.ts)：整理鄰居 ordinals 與具名 QO；單次 Repository 查詢只收 documentIndexId、ordinals。                      |
| 候選政策        | [FindRetrievalChunkCandidatesUseCase](../src/Application/Chunks/UseCases/find-retrieval-chunk-candidates.use-case.ts)：掌握查詢順序、候選選取與 Entity 行為呼叫。                                                                |
| 候選組裝        | [RetrievalCandidateChunkAssembler](../src/Application/Chunks/Assemblers/retrieval-candidate-chunk.assembler.ts)：只根據已選定候選組裝 evidence／match 中間資料，不重新決定候選集合或修改 Entity。                                |
| 組裝入口        | [ChunksModule](../src/Infrastructure/Providers/chunks.module.ts)、[ChunkReplacementModule](../src/Infrastructure/Providers/chunk-replacement.module.ts)：依能力拆分依賴，不能把所有 provider／controller／其他角色重新塞進總檔。 |

## 候選選取的已確認行為

`FindRetrievalChunkCandidatesUseCase` 依序取得 lexical、vector 候選；不任意改為並行。合併時以 vector 候選優先，同 Chunk ID 保留第一個 Entity，再補 lexical 獨有候選。這是 UseCase 的政策。

Assembler 接收已選定的 Entity，依原始候選次序建立 match 資料；重複項保留第一份 evidence，原始名次的空缺不能壓縮。Assembler 不修改 Entity。UseCase 再呼叫 Entity 方法套用 match，並回傳 Entity 集合。相關案例見 [候選選取測試](../tests/Unit/Application/retrieval-candidate-chunk-selection.test.ts)。

## 套用到其他 feature 前

- 逐一核對 Entity 歸屬、Contracts、DTO／QO／Entity 邊界、命名及責任分檔；不能只複製目錄。
- 檔名與公開符號依角色表達動作、Entity 及用途；參數使用具體 `xxxQO`／`xxxDTO`，資料變數說明承載內容，避免 `query`、`input`、`write`、`chunks` 等無法從局部辨識用途的名稱。
- 區分流程政策與資料組裝；純計算不一定屬於 Assembler。Adapter 處理輸入／技術資料形狀，不能包裝查詢政策或 SQL。
- 依共用規範確認具名 Exception、原生 ORM、集合語法及 Resource 回應；向量 SQL 是 [唯一已授權的查詢例外](../AGENTS.md#orm-與向量查詢例外)。
- 保留交易、鎖、失敗檢查及真實功能驗證；測試通過不能掩蓋固定拋錯的功能缺口。其他 feature 仍需各自驗收。

## 證據與限制

已執行的驗證、提交範圍與獨立建置限制集中記錄於 [狀態與驗證](TODO.md#目前狀態與驗證)。

[全文檢索仍阻塞](lexical-search-blocker-20261015.md)：有效 lexical 查詢目前拋出具名 Exception，帶搜尋詞的 hybrid retrieval 尚未完成。不得把這個占位實作當成其他 feature 的範本。
