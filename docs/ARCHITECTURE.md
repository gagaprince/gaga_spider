# Gaga Spider 技术架构文档

> 本文档面向二次开发者，系统性地描述项目的技术栈、目录结构、架构设计、数据模型、核心流程与扩展方式。

---

## 1. 项目概述

Gaga Spider 是一个网络漫画资源抓取与管理系统，支持多源站抓取、本地存储、在线阅读和 PDF 导出。项目采用前后端分离架构，后端负责抓取编排与数据持久化，前端负责资源浏览与阅读。

**核心能力**：

- 多源站漫画抓取（Webtoons 繁体、动漫嗨简体），通过「基类+子类」模式可扩展新源站
- 全站目录发现 + 单本/批量抓取，图片下载到本地
- 异步任务管理，支持停止/重试/冲突自动处理
- 在线阅读（懒加载长图）+ PDF 导出
- 静态资源服务，前端直接访问本地图片

---

## 2. 技术栈

### 后端

| 技术 | 版本 | 用途 |
|------|------|------|
| NestJS | ^11 | Web 框架，模块化架构 |
| TypeORM | ^0.3.20 | ORM，MySQL 8.0+ |
| cheerio | ^1.2.0 | HTML 解析（页面抓取） |
| axios | ^1.19 | 备用 HTTP（实际抓取走 Python） |
| pdfkit | ^0.19.1 | PDF 生成 |
| TypeScript | ^5.7 | 类型安全 |
| Python 3 | 系统自带 | urllib HTTP 请求，绕过 TLS 指纹检测 |

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| React | ^19.2 | UI 框架 |
| React Router | ^7.18 | 路由 |
| Vite | ^6.0 | 构建工具 + 开发服务器 |
| TypeScript | ~5.7 | 类型安全 |
| oxlint | ^1.75 | Lint |

### 基础设施

| 项目 | 说明 |
|------|------|
| Node.js | v20（通过 nvm 管理） |
| MySQL | 8.0+，utf8mb4 编码 |
| macOS | PDF 导出依赖系统自带 `sips` 做图片格式转换 |

---

## 3. 项目目录结构

```
gaga_spider/
├── package.json              # 根 workspace 配置（npm workspaces）
├── frontend/                 # 前端
│   ├── src/
│   │   ├── main.tsx          # 入口，路由定义
│   │   ├── App.tsx           # 布局壳（侧边栏 + Outlet）
│   │   ├── api/client.ts     # 统一 API 客户端
│   │   └── components/       # 页面组件
│   │       ├── BookshelfPage.tsx     # 书架管理（列表+筛选+发现+批量抓取）
│   │       ├── ResourceDetail.tsx    # 漫画详情+章节列表+PDF导出
│   │       ├── ChapterReader.tsx     # 阅读器（懒加载长图）
│   │       ├── TaskPage.tsx          # 任务管理
│   │       ├── SettingsPage.tsx      # 系统设置
│   │       ├── ScrapeModal.tsx       # 单本抓取弹窗
│   │       └── BatchScrapeModal.tsx  # 批量抓取弹窗
│   └── vite.config.ts        # 开发代理 /api + /resourceFiles -> :3000
│
├── backend/                  # 后端
│   ├── scripts/fetch.py      # Python HTTP 层（fetch + download）
│   ├── settings.local.json   # 本地配置（gitignore）
│   └── src/
│       ├── main.ts           # 启动入口（静态资源服务）
│       ├── app.module.ts     # 根模块
│       ├── database/         # 数据库连接（TypeORM）
│       ├── entities/         # 16 个实体定义
│       ├── constants/        # 枚举常量（ResourceType、TaskStatus 等）
│       ├── settings/         # 系统设置（resourcePath 管理）
│       ├── task/             # 任务管理（CRUD + 生命周期）
│       ├── resource/         # 资源管理（查询 + PDF 导出）
│       └── scraper/          # 抓取核心
│           ├── http-client.ts            # Python 调用封装
│           ├── base-comic-scraper.ts     # 抓取基类（共用逻辑）
│           ├── scraper.controller.ts     # 抓取路由（多源站）
│           ├── scraper.module.ts         # 模块注册
│           ├── webtoons/                 # Webtoons 源站
│           │   ├── webtoons-parser.ts
│           │   └── webtoons-scraper.service.ts
│           └── dongmanhi/                # 动漫嗨源站
│               ├── dongmanhi-parser.ts
│               └── dongmanhi-scraper.service.ts
│
├── docs/                     # 文档
│   ├── ARCHITECTURE.md       # 本文档
│   ├── USAGE.md              # 使用文档
│   ├── api.md                # API 接口文档
│   ├── database/             # 数据库设计
│   └── scraper/              # 各源站抓取分析
│       ├── webtoons-analysis.md
│       └── dongmanhi-analysis.md
└── resourceFiles/            # 本地资源存储（gitignore）
    ├── covers/
    ├── images/
    └── pdfs/
```

---

## 4. 后端架构

### 4.1 模块划分

后端采用 NestJS 模块化设计，共 5 个业务模块 + 1 个数据库模块：

```
AppModule
├── DatabaseModule        # TypeORM 连接（MySQL）
├── SettingsModule        # 系统设置（resourcePath）
├── TaskModule            # 任务管理（与 ScraperModule 循环依赖）
├── ScraperModule         # 抓取核心（Webtoons + 动漫嗨）
└── ResourceModule        # 资源管理（查询 + PDF 导出）
```

**模块依赖关系**：

- `TaskModule` ↔ `ScraperModule`：循环依赖（`forwardRef`），因为 Task 重试需要调用 Scraper，Scraper 执行需要调用 Task
- `ResourceModule` → `SettingsModule`：PDF 导出需要 resourcePath
- `ScraperModule` → `TaskModule` + `SettingsModule`：抓取任务编排 + 文件路径

### 4.2 启动流程（main.ts）

```typescript
const app = await NestFactory.create<NestExpressApplication>(AppModule);
app.enableCors();
app.setGlobalPrefix('api', { exclude: ['resourceFiles/(.*)'] });
app.useStaticAssets(resourcePath, { prefix: '/resourceFiles/' });
app.listen(PORT ?? 3000, '0.0.0.0');
```

- API 路由统一加 `/api` 前缀
- 静态资源 `/resourceFiles/` 不加前缀，直接映射到本地磁盘目录
- 监听 `0.0.0.0`，支持局域网访问

### 4.3 数据库连接（DatabaseModule）

通过 `@nestjs/config` 读取环境变量，`TypeOrmModule.forRootAsync` 异步连接：

| 环境变量 | 默认值 | 说明 |
|----------|--------|------|
| DB_HOST | - | 数据库地址 |
| DB_PORT | 3306 | 端口 |
| DB_USERNAME | - | 用户名 |
| DB_PASSWORD | - | 密码 |
| DB_DATABASE | - | 库名 |

- `synchronize: false`：禁止自动建表，使用手动 DDL（`docs/database/schema.sql`）
- `charset: utf8mb4`：支持 emoji 和完整 Unicode
- 开发模式开启 SQL 日志（`NODE_ENV === 'development'`）

### 4.4 抓取核心架构（ScraperModule）

这是项目的核心模块，采用「基类 + 子类」模式支持多源站：

```
BaseComicScraper (abstract)           # 通用逻辑基类
├── WebtoonsScraperService            # Webtoons 实现
└── DongmanhiScraperService           # 动漫嗨实现
```

**BaseComicScraper 基类** 封装所有源站共用逻辑：

| 方法 | 职责 |
|------|------|
| `fetchPage(url)` | 请求页面 + 限速等待 + 异常检测 |
| `downloadCover(sourceId, url, genre)` | 封面下载（3 次重试，按分类分目录） |
| `downloadChapterImage(filepath, webPath, url)` | 章节图片下载（3 次重试，带 Referer） |
| `computeImagePath(sourceId, chapterOrder, imgOrder, url)` | 计算本地存储路径 |
| `saveAuthors(resource, names)` | 作者入库 + 关联 |
| `saveCategory(resource, name)` | 分类入库 + 关联 |
| `checkCancelled(taskId)` | 任务取消信号检查 |
| `sleep(ms)` | 限速等待 |

子类需实现：

| 抽象成员 | 说明 |
|----------|------|
| `baseUrl` | 站点根 URL |
| `rateLimitMs` | 请求间隔（ms） |
| `referer` | 下载图片时的 Referer（默认 baseUrl） |
| `ensureSourceSite()` | 确保 source_sites 表有该站点记录 |
| `parser` | 各自的 cheerio 解析器 |

**路由机制**：

`ScraperController` 提供通用路由和源站专属路由：

```
POST /scraper/scrape-resource          # 通用：按 resourceId 自动路由
POST /scraper/webtoons/discover        # Webtoons 目录发现
POST /scraper/webtoons/scrape          # Webtoons 按 titleNo 抓取
POST /scraper/webtoons/scrape-resource # Webtoons 按 resourceId 抓取
POST /scraper/dongmanhi/discover       # 动漫嗨目录发现
```

通用路由 `scrape-resource` 的路由逻辑：查询 `resource_sources` 表中该 resourceId 关联的 `source_sites.domain`，根据域名选择对应的 scraper 服务。

### 4.5 HTTP 层设计（fetch.py + HttpClient）

**为什么用 Python 而非 Node.js 直接请求**：

Webtoons 有 TLS 指纹检测，Node.js 的 axios/https 会被拦截返回 403。Python urllib 的 TLS 指纹不同，可以绕过。动漫嗨无此限制，但为统一架构同样使用 Python 层。

**调用链**：

```
ScraperService -> HttpClient (TS) -> execFile('python3', fetch.py) -> JSON stdout -> 解析
```

`HttpClient` 封装两个方法：

| 方法 | 说明 | 超时 |
|------|------|------|
| `fetch(url, headers)` | 抓取 HTML 页面 | 30s |
| `download(url, filepath, headers)` | 下载二进制文件 | 60s |

`fetch.py` 提供 `fetch`（返回 HTML）和 `download`（写入文件）两个子命令，输出 JSON 到 stdout。

### 4.6 任务管理（TaskModule）

**TaskService** 管理抓取任务全生命周期：

| 方法 | 职责 |
|------|------|
| `create(data)` | 创建任务（pending） |
| `markRunning(id)` | 标记运行中，注册取消信号 |
| `markSuccess(id, total, done)` | 标记成功 |
| `markFailed(id, msg)` | 标记失败 |
| `markCancelled(id)` | 标记取消，设置取消信号 |
| `stopRunningTasks(resourceId?, titleNo?)` | 停止同资源/同 titleNo 的运行中任务 |
| `isCancelled(id)` | 检查取消信号（内存 Map） |
| `log(taskId, level, msg)` | 写入任务日志 |
| `retry(id)` | 基于原配置创建新任务 |

**取消机制**：使用内存 `Map<number, boolean>` 记录取消信号。Scraper 在每个章节循环点调用 `checkCancelled(taskId)`，如果已取消则抛出异常停止。注意：取消信号不持久化，服务重启后丢失。

**冲突处理**：对同一资源发起新抓取时，先调用 `stopRunningTasks` 停止旧任务，再创建新任务。

**重试路由**：`TaskController.retry` 根据原任务关联的 `sourceSite.domain` 自动路由到对应 scraper。

---

## 5. 数据模型

共 16 张表，设计为多源站通用。核心 ER 关系：

```
source_sites (站点)
    │ 1:N
    ▼
resource_sources (资源↔站点关联) ──N:1──> resources (资源主表)
                                              │ 1:N
                                              ▼
                                          chapters (章节)
                                              │ 1:N
                                              ▼
                                          chapter_images (图片)

resources ──N:M──> authors (通过 resource_authors)
resources ──N:M──> categories (通过 resource_categories)
resources ──N:M──> tags (通过 resource_tags)
resources ──1:N──> volumes ──1:N──> chapters

scrape_tasks (任务) ──N:1──> source_sites
                ──N:1──> resources
                ──1:N──> scrape_logs (日志)
```

### 核心表说明

| 表名 | 说明 | 关键字段 |
|------|------|----------|
| `source_sites` | 来源站点 | domain(唯一)、resource_type(enum)、config(json)、rate_limit |
| `resources` | 资源主表 | type(enum)、title、status、language、cover_url、local_cover_path、category、extra(json) |
| `resource_sources` | 资源↔站点关联 | source_id(源站原始ID)、source_url、scrape_status、is_completed |
| `chapters` | 章节 | order_index、chapter_type(enum: text/image)、source_url、source_site_id、is_downloaded |
| `chapter_images` | 章节图片 | order_index、source_url、local_path、status(pending/downloaded/failed) |
| `scrape_tasks` | 抓取任务 | status(enum)、task_type(enum)、config(json)、total_items、done_items |
| `scrape_logs` | 任务日志 | level(enum)、message、context(json) |

### 多源站设计要点

- `resources` 表不绑定特定站点，通过 `resource_sources` 关联表多对一映射到源站
- 同一漫画如果多站都有，会创建多个 `resource_sources` 记录指向同一个 `resource`
- `chapters` 和 `chapter_images` 通过 `source_site_id` 区分来源
- 图片存储路径用源站原始 ID（`sourceId`）而非本地 resourceId，避免多站冲突

完整表结构见 `docs/database/schema-design.md`，建表语句见 `docs/database/schema.sql`。

---

## 6. 核心业务流程

### 6.1 全站目录发现

```
用户点击「抓取目录」(选择源站)
  │
  ▼
POST /scraper/{site}/discover
  │
  ▼
ScraperService.discoverCatalog()
  ├── ensureSourceSite()              # 确保站点记录存在
  ├── 遍历分类列表页 (分页)
  │     ├── fetchPage(url)            # Python 抓取 HTML
  │     ├── parser.parseComicCards()  # cheerio 解析卡片
  │     └── 逐个卡片入库:
  │           ├── 查 resource_sources 是否已存在 (按 sourceId)
  │           ├── 不存在 -> 创建 resource + downloadCover + resource_source
  │           └── 已存在 -> 补全缺失封面
  └── 返回 { discovered, new }
```

### 6.2 单本/批量抓取

```
用户点击「抓取」(单本) 或批量提交
  │
  ▼
POST /scraper/scrape-resource { resourceId, maxChapters }
  │
  ▼
resolveScraperByResourceId()          # 按 resourceId 查 sourceSite 路由
  │
  ▼
ScraperService.scrapeByResourceIdAsync()
  ├── stopRunningTasks(resourceId)    # 停止旧任务
  ├── create task (pending)
  ├── 异步执行 scrapeOneWithTask():
  │     ├── markRunning(taskId)
  │     ├── doScrape():
  │     │     ├── fetchPage(详情页URL)
  │     │     ├── parser.parseDetail()       # 元数据
  │     │     ├── saveResource + saveAuthors + saveCategory
  │     │     ├── parser.parseChapterList()  # 章节列表
  │     │     └── 逐章:
  │     │           ├── saveChapter()         # 入库
  │     │           ├── fetchPage(阅读页URL)
  │     │           ├── parser.parseViewerImages()  # 图片列表
  │     │           └── 逐图:
  │     │                 ├── computeImagePath()
  │     │                 ├── 检查本地文件存在 -> 跳过
  │     │                 ├── downloadChapterImage()  # 下载
  │     │                 └── 更新/插入 chapter_images 记录
  │     └── markSuccess / markFailed
  └── 返回 { taskId }  # 立即返回
```

**增量抓取机制**：

- 章节级：`chapter.isDownloaded === 1` 时直接跳过整章
- 图片级：下载前 `existsSync(filepath)` 检查，已存在则跳过下载只更新 DB
- DB 级：按 `orderIndex` 查已有记录，增量更新而非全量重插
- 残留清理：本次解析中不存在的旧记录会被删除

### 6.3 PDF 导出

```
POST /resources/:id/export-pdf
  │
  ▼
ResourceService.exportPdf()
  ├── 查询所有章节 + 已下载图片
  ├── 按 orderIndex 排序
  ├── 每章图片垂直堆叠为一页 (无缝拼接)
  │     ├── 首图(Webtoons广告图)跳过
  │     ├── 非 jpg/png 格式 -> sips 转 PNG
  │     └── 单页超 14400pt 自动分页
  ├── 输出 resourceFiles/pdfs/{标题}.pdf
  └── 更新 resources.pdf_path
```

---

## 7. 前端架构

### 7.1 路由结构

```typescript
createBrowserRouter([
  {
    path: '/',
    element: <App />,          // 布局壳：侧边栏 + Outlet
    children: [
      { index: true,                    element: <BookshelfPage /> },    // 书架
      { path: 'tasks',                  element: <TaskPage /> },         // 任务
      { path: 'settings',               element: <SettingsPage /> },     // 设置
      { path: 'resources/:resourceId',  element: <ResourceDetail /> },   // 详情
      { path: 'resources/:resourceId/chapters/:chapterId', element: <ChapterReader /> },
    ],
  },
])
```

### 7.2 API 客户端（api/client.ts）

统一封装所有后端调用，基于 `fetch`：

```typescript
const BASE_URL = '/api';
async function request<T>(path, options): Promise<T> {
  const resp = await fetch(`${BASE_URL}${path}`, { ... });
  if (!resp.ok) throw new Error(...);
  return resp.json();
}
```

开发环境通过 Vite proxy 将 `/api` 和 `/resourceFiles` 转发到 `:3000` 后端。

### 7.3 关键组件

| 组件 | 职责 | 关键交互 |
|------|------|----------|
| `BookshelfPage` | 书架列表 | 分类/状态筛选、搜索、分页、源站选择+目录发现、批量抓取 |
| `ResourceDetail` | 漫画详情 | 元数据展示、章节列表、抓取状态、PDF 导出/下载 |
| `ChapterReader` | 阅读器 | 懒加载（visibleCount 递增）、上下章导航、深色背景 |
| `TaskPage` | 任务管理 | 列表、状态筛选、停止/重试/删除 |
| `ScrapeModal` | 单本抓取弹窗 | 输入 titleNo + maxChapters |
| `BatchScrapeModal` | 批量抓取弹窗 | 多选资源、批量提交 |

### 7.4 阅读器懒加载

`ChapterReader` 使用 `visibleCount` 状态控制渲染图片数量（初始 10 张），滚动到底部时递增加载更多，避免一次性渲染数百张图片导致卡顿。

---

## 8. 资源文件存储

### 目录结构

```
resourceFiles/
├── covers/                         # 封面
│   ├── {分类}/                     # Webtoons 按题材分类
│   │   └── {sourceId}.{ext}
│   └── other/                      # 动漫嗨封面
│       └── {comicId}.{ext}
├── images/                         # 章节图片
│   └── {sourceId}/                 # 源站原始ID（titleNo/comicId）
│       └── {chapterOrderIndex}/    # 章节顺序序号
│           ├── 0001.{ext}          # 零填充 4 位
│           ├── 0002.{ext}
│           └── ...
└── pdfs/                           # 导出PDF
    └── {漫画标题}.pdf
```

### 访问方式

后端 `main.ts` 通过 `app.useStaticAssets(resourcePath, { prefix: '/resourceFiles/' })` 暴露静态文件。前端通过 `localPath` 字段（如 `/resourceFiles/images/5316/1/0001.png`）直接访问。

`resourcePath` 配置存储在 `backend/settings.local.json`，默认为 `{项目根}/resourceFiles`。

---

## 9. 扩展指南：新增源站

这是二次开发最常见的场景。新增一个漫画源站只需 4 步：

### 步骤 1：分析站点

参考 `docs/scraper/webtoons-analysis.md` 和 `dongmanhi-analysis.md` 的格式，分析目标站点的：
- URL 规律（列表页、详情页、阅读页）
- 页面选择器（卡片、详情、章节、图片）
- 反爬情况（TLS 检测、Referer、Cookie）

### 步骤 2：新建 Parser

在 `backend/src/scraper/{站点名}/` 下新建 `{站点名}-parser.ts`，用 cheerio 实现 4 个解析方法：

```typescript
export class XxxParser {
  parseComicCards(html: string): ComicCard[] { ... }      // 列表卡片
  parseDetail(html: string): ComicDetail { ... }          // 详情页
  parseChapterList(html: string): ChapterItem[] { ... }   // 章节列表
  parseViewerImages(html: string): ViewerImage[] { ... }  // 阅读页图片
}
```

### 步骤 3：新建 ScraperService

新建 `{站点名}-scraper.service.ts`，继承 `BaseComicScraper`：

```typescript
@Injectable()
export class XxxScraperService extends BaseComicScraper {
  protected readonly logger = new Logger(XxxScraperService.name);
  private readonly parser: XxxParser;

  protected get baseUrl() { return 'https://xxx.com'; }
  protected get rateLimitMs() { return 1000; }

  constructor(/* 同 webtoons 的构造函数参数 */) {
    super(/* 传给基类 */);
    this.parser = new XxxParser();
  }

  protected async ensureSourceSite() { ... }      // 站点记录
  async discoverCatalog(taskId?) { ... }           // 全站发现
  async scrapeByResourceIdAsync(resourceId, maxChapters) { ... }
  async scrapeOneWithTask(taskId, sourceId, maxChapters) { ... }
  // private doScrape / saveResource / saveChapter / scrapeChapterImages ...
}
```

### 步骤 4：注册路由

1. `scraper.module.ts`：providers 和 exports 加入新 Service
2. `scraper.controller.ts`：新增 `POST /scraper/{站点}/discover` 路由；在 `resolveScraperByResourceId` 中加入域名判断
3. `task.controller.ts`：在 `resolveScraperByTask` 中加入域名判断；retry 方法中加入 instanceof 分支
4. `api/client.ts`：新增 `discoverXxx` 方法
5. `BookshelfPage.tsx`：源站下拉框加入新选项

### 关键约定

- `source_sites.domain` 是路由的唯一标识，需在 `ensureSourceSite` 和路由判断中保持一致
- `resource_sources.sourceId` 用源站原始 ID（字符串），图片存储路径以此命名
- `resources.language` 按站点语言填写（webtoons: `zh-hant`，dongmanhi: `zh-cn`）
- 章节列表如有降序需在 parser 中 `reverse()` 为升序，保证 `orderIndex` 从 1 递增

---

## 10. 构建与部署

### 开发

```bash
nvm use 20
npm install              # 安装前后端所有依赖
npm run dev              # 同时启动前端(:5173)和后端(:3000)
```

### 构建

```bash
npm run build            # 前端 build -> frontend/dist, 后端 build -> backend/dist
npm run start:backend    # 生产模式启动后端
```

### 环境变量

后端通过环境变量配置数据库连接，可通过 `.env` 文件或 shell 注入：

```bash
DB_HOST=localhost
DB_PORT=3306
DB_USERNAME=root
DB_PASSWORD=xxx
DB_DATABASE=gaga_spider
NODE_ENV=development
PORT=3000
PYTHON_BIN=python3       # 可选，默认 python3
```

### Lint

```bash
npm run lint             # 前端 oxlint + 后端 eslint
```

---

## 11. 相关文档

| 文档 | 说明 |
|------|------|
| [USAGE.md](USAGE.md) | 使用文档（功能操作指南） |
| [api.md](api.md) | API 接口文档 |
| [database/schema-design.md](database/schema-design.md) | 数据库表结构设计 |
| [scraper/webtoons-analysis.md](scraper/webtoons-analysis.md) | Webtoons 抓取分析 |
| [scraper/dongmanhi-analysis.md](scraper/dongmanhi-analysis.md) | 动漫嗨抓取分析 |
