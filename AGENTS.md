# AGENTS.md

先讀 Obsidian [Rag-Service/CONTEXT.md](../../Documents/Worker/BackEnd/Rag-Service/CONTEXT.md)，依索引讀取開發規範、環境注意事項與相關程式。

進場必讀與任務相關的記憶：

- 專案 [Rag-Service/MEMORY.md](../../Documents/Worker/BackEnd/Rag-Service/MEMORY.md)。
- [後端共用記憶](<../../Documents/Worker/BackEnd/Shared Memory.md>)。
- [Agent 操作記憶索引](<../../Documents/Worker/Shared/Agent 操作記憶索引.md>)，依本次操作讀取相關案例。

Vault：`~/Documents/Worker`。記憶入口與維護方式依 [共用文件維護規範](../../Documents/Worker/文件維護規範.md#記憶入口)。必要文件無法存取時回報缺失，不以推測替代規範。

## 資料庫結構文件核對

只要本次任務有任何專案檔案異動（新增、修改、刪除或重新命名），交付前都必須核對 [rag-database-schema](assets/diagrams/rag-database-schema.md)。以目前的 migrations、TypeORM Models 與相關實作為準，確認 Markdown 文件、互動 HTML 與 SVG 內容一致且正確。若發現落差，須在同一次變更中同步更新受影響的文件與圖表。
