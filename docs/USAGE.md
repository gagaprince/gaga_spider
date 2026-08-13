# Gaga Spider 使用文档

网络漫画/小说资源抓取与管理系统，支持多源站（Webtoons、动漫嗨）漫画抓取、本地存储、在线阅读和导出 PDF。

---

## 1. 环境准备

**技术栈**

- 前端：React 19 + Vite + TypeScript + React Router
- 后端：NestJS + TypeORM + TypeScript + MySQL
- HTTP 层：Python（urllib，绕过 Webtoons TLS 指纹拦截）
- PDF 生成：pdfkit + macOS sips（格式转换）

**环境要求**

- Node.js v20（通过 nvm 管理）
- Python 3（系统自带即可）
- MySQL 8.0+ 远程数据库
- macOS（PDF 导出的 sips 格式转换依赖系统自带工具）

**安装依赖**

```bash
cd gaga_spider
nvm use 20
npm install        # 安装前后端所有依赖
```

**数据库配置**

数据库连接信息保存在 `docs/database/connection.local.cnf`（已加入 .gitignore，不提交）。首次使用需确保该文件包含正确的连接参数。

---

## 2. 启动服务

```bash
# 同时启动 PC 前端、后端和手机端
npm run dev

# 或分别启动
npm run dev:frontend    # 前端: http://localhost:5173
npm run dev:backend     # 后端: http://localhost:3000
npm run dev:mobile      # 手机端: http://localhost:5174
```

前端开发服务器会自动代理 `/api` 和 `/resourceFiles` 请求到后端。

---

## 3. 功能概览

| 功能模块       | 说明                                         |
| -------------- | -------------------------------------------- |
| 书架管理       | 浏览、筛选、搜索已抓取的漫画资源             |
| 漫画阅读       | 在线阅读章节图片，上下章导航                 |
| 目录抓取       | 多源站目录发现，抓取漫画列表并下载封面       |
| 单本/批量抓取  | 按书籍触发全本抓取，下载所有章节图片到本地   |
| 任务管理       | 查看任务状态，停止/重试/删除任务            |
| PDF 导出       | 整本 PDF / 按章节 PDF，可打包 ZIP 或逐章下载 |
| 手机端         | 手机浏览搜索/阅读/下载 PDF，不含抓取控制     |
| 系统设置       | 配置本地资源文件存储路径                     |

---

## 4. 书架管理

**访问路径**：左侧菜单 -> 书架管理（`/`）

**功能说明**：

- **分类筛选**：顶部按分类标签筛选（動作、戀愛、奇幻等）
- **抓取状态筛选**：已抓取 / 未抓取
- **关键词搜索**：按标题模糊搜索
- **分页浏览**：每页 20 本，支持翻页

**单本操作**：

- 点击书籍卡片进入详情页
- 每本书卡片上有「抓取」按钮，点击触发该书的全文抓取任务

**批量抓取**：

- 右上角「批量抓取」按钮，弹出选书对话框
- 可勾选部分书籍或一键全选
- 确认后批量发起抓取任务

**目录抓取**：

- 右上角源站选择下拉框，切换目标源站（Webtoons / 动漫嗨）
- 点击「抓取目录」按钮，抓取所选源站的全站漫画列表，下载封面到本地
- 新发现的书籍会自动入库

**各源站发现范围**：

- **Webtoons**：遍历全部 23 个题材分类（action、drama、romance 等），抓取每个分类下的漫画卡片
- **动漫嗨**：遍历「全部分类」(`/list/0-0-0-0/`) 的所有分页（每页 24 部），逐页抓取漫画卡片

---

## 5. 漫画详情与阅读

**详情页**（`/resources/:id`）：

- 展示封面、标题、作者、分类、状态、章节数等信息
- 章节列表按顺序排列，显示每章抓取状态（✓ 已抓取 / 未抓取）
- **导出 PDF**：
  - **整本 PDF**：点击「📄 导出 PDF」按钮，将所有章节图片打包为单个 PDF
    - 保存在 `resourceFiles/pdfs/{漫画标题}.pdf`
    - 导出完成后显示下载链接，已导出的书再次进入会自动显示
  - **按章节 PDF**：点击「📑 按章节导出 PDF」按钮，每个章节单独生成一个 PDF
    - 保存在 `resourceFiles/pdfs/chapters_{id}/` 目录，文件名 `0001_章节标题.pdf`
    - 适合整本过大不便观看的场景；生成后可「📦 打包下载 ZIP」整体下载，或逐章「下载 ↓」
    - 每次重新生成会清空旧分章目录与旧 ZIP 缓存

**阅读页**（`/resources/:id/chapters/:chapterId`）：

- 点击章节列表中任意章节进入阅读
- 图片自上而下无缝拼接展示，深色背景护眼
- 懒加载：滚动到底部自动加载更多图片
- 底部导航：上一章 / 下一章，显示目标章节标题
- 浏览器后退/前进正常工作

---

## 6. 任务管理

**访问路径**：左侧菜单 -> 任务管理（`/tasks`）

**任务说明**：

每次发起抓取（目录抓取、单本抓取、批量抓取、重试）都会创建一条任务记录。

**任务状态**：

| 状态       | 说明                                   |
| ---------- | -------------------------------------- |
| pending    | 已创建，等待执行                       |
| running    | 正在抓取中                             |
| success    | 抓取完成                               |
| failed     | 抓取失败，errorMessage 字段记录原因    |
| cancelled  | 被用户停止或被同资源的新任务替代       |

**任务操作**：

- **停止**：标记任务取消，抓取进程在下一个检查点停止
- **重试**：基于原任务配置创建新任务并立即执行
- **删除**：删除任务及其关联日志

**冲突处理**：

对同一资源发起抓取时，会自动停止该资源正在运行的任务，再创建新任务开始抓取。旧任务状态变为 cancelled。

---

## 7. PDF 导出

提供两种导出方式，均位于书籍详情页。

### 7.1 整本 PDF

**触发方式**：详情页 -> 「📄 导出 PDF」按钮

**导出逻辑**：

- 收集该资源所有章节的已下载图片
- **每个章节的图片垂直堆叠在一页上**，章节间强制另起一页
- 图片间零间距，无缝拼接
- 单页高度超过 PDF 限制（14400pt）时自动分页
- **每章第一张图片（Webtoons 广告图）自动排除**
- 不支持的图片格式（GIF 等）通过 macOS `sips` 转为 PNG 后再导入
- 转换失败的图片跳过并记录日志

**输出位置**：`resourceFiles/pdfs/{漫画标题}.pdf`

**路径记录**：导出成功后将 PDF 路径写入 `resources.pdf_path` 字段

**下载**：详情页点击「下载 PDF ↓」链接直接下载

### 7.2 按章节 PDF

**触发方式**：详情页 -> 「📑 按章节导出 PDF」按钮

**适用场景**：整本 PDF 文件过大不便观看时，按章拆分。

**导出逻辑**：

- 每个已下载图片的章节单独生成一个 PDF（复用整本导出同一套排版逻辑）
- 无图片的章节自动跳过
- 每次重新生成会清空旧分章目录与旧 ZIP 缓存，避免残留过期文件

**输出位置**：

```
resourceFiles/pdfs/
├── chapters_{resourceId}/              # 分章 PDF 目录
│   ├── 0001_第710话.pdf
│   ├── 0002_第711话.pdf
│   └── ...
└── chapters_{resourceId}.zip           # 打包下载缓存（按需生成）
```

**下载方式**：

- **打包下载**：点击「📦 打包下载 ZIP ↓」，后端用系统 `zip -j` 打包所有分章 PDF 并流式返回（中文名按 RFC 5987 编码）
- **逐章下载**：分章列表中每行「下载 ↓」单独下载对应章节 PDF
- 进入详情页时自动回显已生成的分章列表

> 相关接口：`POST /resources/:id/export-chapter-pdfs`、`GET /resources/:id/chapter-pdfs`、`GET /resources/:id/chapter-pdfs/zip`

---

## 8. 手机端（移动阅读站）

`mobile/` 是独立的手机端前端工作区，与 PC 端 `frontend/` 共用同一后端，但**只提供浏览/阅读/导出 PDF 功能，不含抓取控制**，适合在手机上随时看漫画。

**功能范围**

- 书架只展示**已抓取到章节数据**的漫画（`scrapeStatus=scraped`），未抓取的目录项不显示
- 搜索漫画标题、按分类/完结状态筛选、分页加载更多
- 漫画详情：封面/作者/分类/简介 + 章节列表；一本书有多个源时可顶部「选择来源」切换，切换后章节与 PDF 均对应当前源
- 在线阅读：全屏深色竖向滚动阅读器，懒加载，上/下章导航
- PDF 下载：整本 PDF、按章节 PDF、打包 ZIP、逐章下载（按源隔离文件）

> 不包含：目录抓取、单本/批量抓取、任务管理、系统设置（这些仍在 PC 端操作）。

**启动方式**

```bash
npm run dev:mobile     # 手机端: http://localhost:5174
```

开发服务器默认 `host: true`，手机与电脑处于同一局域网时，用手机浏览器访问 `http://<电脑局域网 IP>:5174` 即可。需后端在 `http://localhost:3000` 运行（Vite 会代理 `/api` 与 `/resourceFiles` 到后端）。

**访问远端后端**

若后端不在本机，可通过环境变量指向远端地址（在 `mobile/` 下创建 `.env.local`）：

```
VITE_API_BASE=http://192.168.1.100:3000/api
VITE_RESOURCE_BASE=http://192.168.1.100:3000
```

- `VITE_API_BASE`：API 请求前缀，默认 `/api`
- `VITE_RESOURCE_BASE`：本地资源（封面/图片/PDF）地址前缀，默认为空（走代理）

`api/client.ts` 中的 `assetUrl()` 会把后端返回的 `/resourceFiles/...` 路径补上该前缀。

**构建**

```bash
npm run build:mobile   # 产物在 mobile/dist/
```

**移动端适配**

- viewport 禁止缩放 + `viewport-fit=cover`，顶/底栏用 `env(safe-area-inset-*)` 避开刘海/底部条
- 输入框 `font-size: 16px` 防止 iOS 聚焦自动放大，按钮触控区放大
- 阅读器全屏、暗色背景，与 PC 端阅读页体验一致

**技术栈**：与 PC 端 `frontend/` 相同（React 19 + Vite + TypeScript + React Router），复用根 `node_modules`，无需额外安装依赖。

---

## 9. 系统设置

**访问路径**：左侧菜单 -> 设置（`/settings`）

**可配置项**：

- **资源文件路径**：本地资源文件（封面、章节图片、PDF）的存储根目录
  - 默认值：`{项目根目录}/resourceFiles`
  - 修改后立即生效，自动创建目录
  - 配置保存在 `backend/settings.local.json`（已加入 .gitignore）

---

## 10. 资源文件目录结构

```
resourceFiles/
├── covers/              # 漫画封面
│   ├── 動作/            # Webtoons 按分类分目录
│   │   └── 7709.jpg
│   ├── 戀愛/
│   │   └── 1618.png
│   └── other/           # 动漫嗨封面（按 other 分类）
│       └── 5316.jpg
├── images/              # 章节图片
│   └── {sourceId}/      # 按源站原始编号（Webtoons titleNo / 动漫嗨 comicId）
│       └── {orderIndex}/ # 按章节顺序序号
│           ├── 0001.jpg # 零填充序号
│           ├── 0002.png # 动漫嗨图片扩展名混用 .png/.jpg
│           └── ...
└── pdfs/                # 导出的 PDF
    ├── {漫画标题}.pdf            # 整本 PDF
    ├── chapters_{id}/            # 按章节 PDF 目录
    │   ├── 0001_章节标题.pdf
    │   └── ...
    └── chapters_{id}.zip         # 分章 PDF 打包缓存
```

> `resourceFiles/` 目录已加入 .gitignore，不会提交到 GitHub。

---

## 11. 抓取技术说明

**Python HTTP 层**

Node.js 的 axios/https 被 Webtoons TLS 指纹检测拦截，因此通过 Python urllib 发起请求。NestJS 通过 `child_process.execFile` 调用 `backend/scripts/fetch.py`。

**URL 编码**

Webtoons 图片 URL 中包含中文路径，`fetch.py` 内置 `encode_url()` 对中文进行 percent-encode。

**分页防死循环**

Webtoons 列表页超过最后一页时会回绕到第 1 页。通过跟踪已见 `episodeNo` 的 Set，当某页所有章节均重复时判定为最后一页，停止翻页。

**封面下载**

下载封面时带 3 次重试，间隔递增（1s、2s、3s）。

**章节图片下载**

- 下载前先检查本地文件是否存在，已存在则跳过下载
- 已下载的章节通过 `chapter.isDownloaded` 短路检查直接跳过
- 重新抓取未完成章节时，先查已有 DB 记录，增量更新而非全量重插
- 数据库 `uk_chapter_order (chapter_id, order_index)` 唯一索引兜底防重

**多源站架构**

系统采用「基类 + 子类」模式支持多源站抓取：

- `BaseComicScraper` 抽象基类：封装 `fetchPage`、`downloadCover`、`downloadChapterImage`、`computeImagePath`、`saveAuthors`、`saveCategory` 等通用方法
- `WebtoonsScraperService` / `DongmanhiScraperService`：继承基类，实现各自站点的解析逻辑（`baseUrl`、`rateLimitMs`、`ensureSourceSite`、parser）
- 通用接口 `POST /scraper/scrape-resource`：根据 resourceId 关联的 sourceSite 自动路由到对应 scraper
- 任务重试：根据任务所属 sourceSite 域名自动路由到对应 scraper

**动漫嗨 (dongmanhi.com) 抓取说明**

| 维度         | 说明                                                                 |
| ------------ | -------------------------------------------------------------------- |
| 资源标识     | comicId（URL 路径 `/manhua/{comicId}/`）                             |
| 语言         | `zh-cn`（简体中文）                                                  |
| 章节列表     | 单页全量内嵌 HTML，页面为降序（最新在前），抓取时自动反转为升序      |
| 阅读页图片   | `.lazyBox img.lazyload` 的 `data-original` 属性，全部内嵌无需 JS     |
| 图片 CDN     | `img.dongmanhi.com`，无需 Referer                                    |
| 限速         | 1000ms / 请求                                                        |
| 评分         | 解析 `.detail-info-stars span`（如 "8.0分"）                         |
| 全站发现     | 遍历 `/list/0-0-0-0/` 全部分页，每页 24 部                           |

---

## 12. 数据库表概览

共 16 张表，核心表如下：

| 表名               | 说明                         |
| ------------------ | ---------------------------- |
| resources          | 资源主表（漫画/小说）        |
| chapters           | 章节表                       |
| chapter_images     | 章节图片表                   |
| resource_sources   | 资源来源关联                 |
| source_sites       | 来源站点                     |
| authors            | 作者表                       |
| categories         | 分类表                       |
| scrape_tasks       | 抓取任务表                   |
| scrape_logs        | 任务日志表                   |
| settings           | 系统设置                     |

完整表结构设计见 `docs/database/schema-design.md`，建表语句见 `docs/database/schema.sql`。

---

## 13. 常见问题

**Q: 图片在前端显示不出来？**

Webtoons 做了防盗链，源站图片无法直接在浏览器加载。系统会将封面和章节图片下载到本地，前端通过本地路径访问。确保后端已启动且 `resourceFiles` 目录配置正确。

**Q: 抓取任务一直运行不停？**

已修复分页死循环问题（Webtoons 超过最后一页回绕到第 1 页）。如果任务卡住，可在任务管理页手动停止。

**Q: 导出 PDF 失败？**

- 确保该书籍已有已下载的章节图片
- GIF 等格式会自动转换为 PNG，需要 macOS 环境（依赖 sips）
- 查看 backend 日志中的警告信息

**Q: 章节图片重复？**

已通过数据库唯一索引 + 代码去重修复。如遇历史残留重复数据，可执行 `docs/database/fix_duplicate_images.sql` 清理。

---

## 14. 相关文档

- [技术架构文档](ARCHITECTURE.md) - 整体架构、数据模型、核心流程、扩展指南

- [API 接口文档](api.md) - 所有后端接口的详细说明
- [数据库表结构设计](database/schema-design.md) - 16 张表的设计文档
- [建表语句](database/schema.sql) - DDL SQL
- [Webtoons 抓取分析](scraper/webtoons-analysis.md) - 页面层级与采集规则分析
- [动漫嗨抓取分析](scraper/dongmanhi-analysis.md) - 页面层级与采集规则分析
