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

- `npm run reset:database` 會先在 `.local/import-manifest.json` 原子保存目前 Obsidian 的 project、knowledge base、source 與 membership 設定，再刪除十張 RAG 資料表中的資料。它會拒絕仍有執行中索引工作的情況；若目前沒有 Obsidian mapping，會保留既有 manifest 不變並仍清除 RAG 資料。Migration/schema 與其他資料表不會刪除。
- `npm run import -- obsidian` 會優先讀取 `.local/import-manifest.json`；僅當預設 manifest 不存在時才讀取 live catalog。若 manifest 格式錯誤或沒有 Obsidian mapping，會明確失敗。預設 recovery manifest 完整匯入成功後會改名為 `.local/import-manifest.json.completed`，之後再次執行會讀 live catalog，以納入後來新增或更新的 metadata；失敗時保留 manifest。也可指定 `npm run import -- obsidian --manifest <path>`，指定的 manifest 會直接作為來源且不會封存或改動。舊的 `--source obsidian` 寫法仍相容。若設定 `OBSIDIAN_ROOT`，每次一般 import 都會掃描該 vault 中所有非隱藏目錄下的 `.md` 文件，並依最近的祖先 `CONTEXT.md` 所在目錄分組；例如 `BackEnd/Agent-Teams/**` 使用 `Agent-Teams`，`BackEnd/Rag-Service/**` 使用 `Rag-Service`。沒有專案 `CONTEXT.md` 祖先的文件使用預設 fallback 專案（預設 `worker/obsidian-worker` / `Worker Obsidian`，可分別用 `RAG_OBSIDIAN_PROJECT_ID`、`RAG_OBSIDIAN_PROJECT_NAME` 覆寫）。Context 專案 ID 由 fallback project ID 的 namespace 與 vault 相對目錄路徑衍生，Knowledge Base UUID 固定由 project ID/vault root 產生。每次掃描都會將既有同 sourceKey/sourcePath mapping 的 project 歸屬更新為最新分組，並保留其 title、payload、isEntry 與 alwaysIncludeFullContent；但既有資料庫中的舊 fallback membership 不會自動刪除，以免破壞共享文件/chunks。若要完整重建並清除舊歸屬，先執行 `npm run reset:database` 再執行 import。顯式 `--manifest` 只匯入該 manifest 指定的範圍，不會套用 vault 全量掃描。Obsidian reader 從 vault root/source path 讀取目前文件，透過 Nest application context 呼叫既有 indexing request/status listeners，並等待索引工作完成；不啟動 HTTP server，也不呼叫 HTTP API。入口使用 source reader registry，供後續新增其他來源。
- 匯入工作由既有 worker 處理，執行 import 時必須有 worker 運作；任何 request 或索引工作失敗都會以非零狀態結束。可用 `RAG_IMPORT_MANIFEST` 覆寫 reset/import 預設 manifest 路徑；可用 `RAG_IMPORT_TIMEOUT_MS` 調整等待索引工作的逾時時間。
- Docker build 與 runtime 使用相同 Node 26.8.1 Debian Bookworm slim image；ONNX Runtime 的 Linux ARM64 native binding 需要 glibc，因此不使用 Alpine/musl image。
- `RAG_DATABASE_URL` 必須能從執行 `npm` 指令的環境連線：在 host 執行時目前 compose 資料庫位址為 `127.0.0.1:30684`；在 container 內執行時使用 `database` hostname。請自行在該環境設定正確連線字串；維護指令不會自動修改 `.env`。
- Docker worker 使用 host 上既有的 Codex 登入時，需在 host 啟動 `npm run start:host-cli`。設定 `RAG_HOST_CLI_SHARED_SECRET` 為至少 32 字元的隨機值，並在 host 與 Compose worker 共用；Docker Desktop 下將 `RAG_HOST_CLI_BIND_ADDRESS=0.0.0.0`、`RAG_HOST_CLI_PORT=30701`，worker 會連到 `host.docker.internal`。此 bridge 僅接受固定的 chunk-planning 操作，使用 host 設定的 Codex executable/model/timeout；不提供任意命令執行。預設 bind address 是 `127.0.0.1`，只在需要 Docker 連線時才改為 `0.0.0.0`。`npm run start:host-cli` 使用 host 現有的 Codex CLI 登入，需保持此 host process 運作；設定的模型也必須可由該 host CLI 帳號使用。Compose worker 不包含 Codex CLI 或登入憑證。
- Compose 透過 `env_file` 將 `.env` 變數注入服務，並以唯讀 bind mount 將同一檔案掛到 `/app/.env`，供容器內直接執行的維護指令載入。
- 維護命令使用已編譯的 `dist/`。在 host 修改程式後先執行 `npm run build`，再執行維護命令；production image 內已包含 `dist/` 與 `scripts/`，無需安裝 dev dependencies。要在容器使用新命令，需從更新後的原始碼重建並部署 image；既有 image 不會因 host 檔案更新而自動取得 npm scripts。
- `.env` 的 `OBSIDIAN_ROOT` 必須是 host 上的絕對路徑；Compose 會把該路徑以唯讀方式掛載到 API container 的同一絕對路徑，讓 `npm run import -- obsidian` 可直接讀取文件。預設為 `/Users/xiang/Documents/Worker`，其他環境請在自己的 `.env` 設定實際 vault 路徑；不要將 `.env` 範本的本機路徑直接用於不同主機。
- `import` 會依 manifest 的 `sourceKey` / `sourcePath` 讀取 vault 中目前的檔案。從 container 執行時，設定的 vault 絕對路徑必須能在 container 中以相同路徑存取；Compose 對 Obsidian vault 使用唯讀掛載。
- Import manifest 僅保存資料庫已持久化的 source 與 membership metadata，不保存文件內容或向量。重建時會讀取 vault 的最新文件；資料庫沒有持久化的 source payload 無法由 manifest 還原。
