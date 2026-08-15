# Manhwa18 (manhwa18.cc) 抓取分析

> 成人英文漫画/韩漫源站，分级为 `adult`。所有资源文件落入 `18/` 子目录，实现物理隔离。

## 站点信息

| 维度 | 说明 |
|---|---|
| 域名 | `manhwa18.cc` |
| 名称 | Manhwa18 |
| 语言 | English (`en`) |
| 分级 | 成人限定 (`adult`) |
| 资源标识 | slug（URL 化书名，如 `wireless-onahole`） |
| 封面 CDN | `manhwa18.cc/manga/` |
| 章节图 CDN | `img01.manhwa18.cc/online/...`，需带 `Referer: https://manhwa18.cc` |
| 限速 | 1000ms / 请求 |
| 反爬 | Cloudflare CDN，HTML 服务端直出，无 JS 挑战 / TLS 指纹拦截，Python urllib 直连即可 |

## URL 规律

| 页面 | URL 格式 |
|---|---|
| 列表首页 | `https://manhwa18.cc/webtoons` |
| 列表翻页 | `https://manhwa18.cc/webtoons/{N}`（从 2 开始） |
| 详情页 | `https://manhwa18.cc/webtoon/{slug}` |
| 阅读页 | `https://manhwa18.cc/webtoon/{slug}/chapter-{chapterId}` |

- 列表每页 24 部，截至分析时共 155 页（越界页码会被服务端 clamp 到最后一页）。
- 分页组件 `ul.pagination`：末页的 `li.next` 带 `disabled` class，据此判断是否还有下一页。
- `chapterId` 为数字（如 `111`），列表中**最新章节在前**，需 `reverse()` 后再按顺序入库。

## 页面选择器

### 列表卡片 `.manga-item`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 详情链接 | `.thumb > a[href^="/webtoon/"]` | 提取 `/webtoon/{slug}` 中的 slug |
| 标题 | `.thumb > a[title]` | 完整英文标题 |
| 封面 | `.thumb img[data-src]` | 封面缩略图 |
| 更新日期 | `.post-on`（取匹配 `DD Mon YYYY` 的文本） | 第一个 `.post-on` 可能只有 new 图标，需筛选含日期文本的节点 |

### 详情页

| 字段 | 选择器 | 说明 |
|---|---|---|
| 标题 | `.post-title h1` | 需去掉开头的 `18+` 标记 |
| 封面 | `.summary_image img[data-src]` | |
| 作者 | `.author-content a[href*="/author/"]` | 可能有多个 |
| 分类 | `.genres-content a[href*="/webtoon-genre/"]` | 第一个作为主分类 `category` |
| 状态 | `.post-content_item` 中 `h5` 文本为 `Status` 的 `.summary-content` | `OnGoing` / `Completed` |
| 简介 | `.panel-story-description .dsct` | 多段 `<p>` 合成文本 |

> 注意：`.post-status .summary-content` 拿到的是发行年份（Release），不是连载状态，状态需按 `h5` 文案匹配。

### 章节列表 `ul.row-content-chapter li.a-h`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 阅读链接 | `a.chapter-name[href]` | 提取 `/chapter-{id}` |
| 标题 | `a.chapter-name[title]` 或文本 | 如 `Chapter 111` |

### 阅读页图片 `img.loading[data-src]`

- 章节正文图片均带 `class="loading p{N}"` 与 `data-src`，按文档顺序即为页码。
- 页面其他推荐位封面图不带 `loading` class，不会被误选。
- 图片域名 `img01.manhwa18.cc`，下载时由基类统一附加 `Referer: https://manhwa18.cc/`。

## 实现清单

- Parser：`backend/src/scraper/manhwa18/manhwa18-parser.ts`
- Service：`backend/src/scraper/manhwa18/manhwa18-scraper.service.ts`（覆盖 `ageRating = ADULT`，`language = 'en'`）
- 注册：`scraper.module.ts`、`scraper.controller.ts`（`POST /scraper/manhwa18/discover`）、`scraper-initializer.service.ts`
- 前端：`frontend/src/api/client.ts` 新增 `discoverManhwa18`，`BookshelfPage.tsx` 按域名 `manhwa18.cc` 路由
- 源站记录与抓取入库的资源自动继承 `adult` 分级，文件落入 `18/` 子目录
