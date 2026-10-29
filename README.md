# RAG Service

RAG Service 是獨立的知識檢索服務，負責將來源文件轉成可搜尋、可追溯的知識。
呼叫端提供文件與專案範圍，服務保存內容版本、建立索引，並回傳相關知識。

## 能做什麼

- 接收來源文件，依來源身分管理文件，保存內容修訂版本。
- 將文件納入專案知識庫，保留來源與知識庫文件的關聯。
- 在背景規劃切塊、產生向量並建立索引，提供工作狀態與失敗重試。
- 啟用已完成的 READY 索引版本，供後續檢索使用。
- 在指定專案內結合向量相似度與全文匹配，執行 Hybrid 檢索。
- 回傳相關片段、來源資訊，以及組裝上下文所需的全文。

## 基本流程

### 1. 提交來源文件

呼叫端提交專案、來源識別與文件內容。
服務辨識文件身分、保存內容版本，並建立對應的知識庫文件關聯。

### 2. 在背景建立知識索引

索引工作交由背景程序執行，完成切塊規劃與向量產生。
索引完成後進入 READY 狀態，再啟用可供檢索的版本。
呼叫端可查詢處理狀態，並針對失敗工作提出重試。

### 3. 取得相關知識

呼叫端提供專案與查詢文字，服務在該專案的知識範圍內搜尋。
Hybrid 檢索結合語意相似度與全文相關度，回傳相關片段及來源。
需要完整內容的文件會一併納入上下文；必要知識尚未就緒時，服務回報狀態。

## 責任邊界

RAG Service 負責文件、內容版本、知識庫文件關聯、索引與檢索結果。
API 接收請求與提供結果，背景程序處理索引工作及相關回收流程。

呼叫端負責提供來源、選擇專案範圍，並決定如何使用取回的知識。
對話管理、任務規劃與回答生成由使用此服務的應用程式負責。
本服務提供知識上下文，不直接生成對話答案。

## Obsidian 索引維護

```bash
npm run reset:database      # 保存匯入設定，清空 RAG 資料
npm run import -- obsidian  # 匯入整個 vault，建立 chunks 與向量
npm run retry:failed-jobs   # 排隊重試尚未重試的失敗索引工作
npm run retry:failed-jobs -- --project <project_id>
npm run retry:failed-jobs -- --id <failed_job_id>
```

- `.env` 設定 `OBSIDIAN_ROOT`（vault 絕對路徑）與 `RAG_DATABASE_URL`（容器內使用 `database`，host 使用 `127.0.0.1:30684`）。Compose 會掛載 `.env` 與 vault。
- 匯入時需保持 worker 運作；使用 host Codex 切塊時，在 host 執行 `npm run start:host-cli`。Docker 連線需設定 `RAG_HOST_CLI_BIND_ADDRESS=0.0.0.0`，host 與 worker 共用至少 32 字元的 `RAG_HOST_CLI_SHARED_SECRET`。
- Host bridge 預設同時執行一個 Codex CLI；`RAG_HOST_CLI_MAX_CONCURRENCY` 可設為正整數提高上限。超出上限的請求會以 `HOST_CLI_BUSY` 回覆，worker 只會在 `RAG_EXTERNAL_REQUEST_TIMEOUT_MS` 設定的整體請求期限內重試此原因。
- 每個 worker 同時處理一個工作；匯入每批最多排入 8 個並等待完成後再送下一批。需要擴充處理量時，在 host 的專案根目錄執行 `docker compose up -d --no-deps --scale worker=4 worker`，用 `docker compose ps worker` 查看 worker 狀態。
- 文件依最近的 `CONTEXT.md` 所在專案資料夾分組；有 YAML frontmatter `project` 時直接作為 `project_id`，缺少時沿用路徑隔離的 fallback。不同資料夾重複宣告相同 `project` 會停止匯入，避免把專案混在一起。未歸屬專案的文件放入 `Worker Obsidian`。清除舊分組請先 reset 再 import。
- 匯入會分批等待索引完成，失敗以非零狀態結束。Reset 遇到執行中的索引工作會拒絕清除。
- Failed job 重試指令只將執行時找到的未重試失敗工作交給既有 worker 排隊處理，不會重試本次執行中才新產生的失敗；可用 `--project` 或 `--id` 限定範圍。成功排隊時會在同一交易刪除原 `failed_jobs` 記錄；若交易失敗，不會建立重試工作，原失敗記錄保留。已重試、已過期或正在執行的工作會列為 skipped；指令成功代表排隊完成，仍需 worker 運作才能完成索引。
- 匯入設定保存在 `.local/import-manifest.json`，不含文件內容；重建時讀取 vault 最新檔案。只匯入指定清單可用 `npm run import -- obsidian --manifest <path>`。
- 修改程式後，host 先執行 `npm run build`；Docker 需重建並更新容器。
