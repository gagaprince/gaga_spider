# Rman8 (rman8.com) 抓取分析

> 肉漫屋（H漫禁漫天堂），成人简中漫画源站，分级为 `adult`，资源文件落入 `18/` 子目录。

## 站点信息

| 维度 | 说明 |
|---|---|
| 域名 | `rman8.com` |
| 名称 | 肉漫屋 |
| 语言 | 简体中文（`zh-cn`，章节标题多为繁体但站点 UI 为简中） |
| 分级 | 成人限定（`adult`） |
| 资源标识 | 数字 book ID，如 `11113752`（详情页 `/readbooks/{id}.html`） |
| 封面 CDN | `new.niaopic.com` / `thumb.niaopic.com`，需带 `Referer: https://rman8.com/` |
| 章节图 CDN | `img.nnpic.xyz`，需带 `Referer: https://rman8.com/` |
| 限速 | 800ms / 请求 |
| 反爬 | MacCMS + conch 模板，HTML 服务端直出，无 JS 挑战 / TLS 指纹拦截，Python urllib 直连即可，仅图片有 Referer 防盗链 |

## URL 规律

| 页面 | URL 格式 |
|---|---|
| 列表首页 | `https://rman8.com/bookcatalog/all/ob/time/st/all` |
| 列表翻页 | `https://rman8.com/bookcatalog/all/ob/time/st/all/page/{N}`（从 2 开始） |
| 详情页 | `https://rman8.com/readbooks/{id}.html` |
| 阅读页 | `https://rman8.com/readbooks/{id}/{chapterToken}.html` |

- 列表每页 24 部，截至分析时 `all` 共 111 页、2648 个结果。
- 分类导航另有韩漫/日漫/3D漫画/单本/美女，但目录发现统一走 `all`。
- 越界页码会被服务端 clamp 到最后一页，不能仅凭「返回 200」判断末页，需读取分页组件。

## 页面选择器

### 列表卡片 `li.hl-list-item`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 详情链接 | `a.hl-item-thumb[href]` | 提取 `/readbooks/{id}.html` 中的数字 id |
| 标题 | `a.hl-item-thumb[title]` | 完整书名 |
| 封面 | `a.hl-item-thumb[data-original]` | 懒加载封面 |
| 更新时间 | `.hl-item-sub` | 如「16小时之前」 |

- 列表卡片不携带标签信息，目录发现阶段分类置空，待全文抓取时补全。

### 末页判断

- 首选解析分页条 `<div class="hl-page-total">1&nbsp;/&nbsp;111页</div>` 中的总页数。
- 兜底取分页区 `a[href*="/page/"]` 中最大的页码。

### 详情页 `.hl-detail-content`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 标题 | `h1.hl-dc-title` | |
| 封面 | `.hl-dc-pic .hl-item-thumb[data-original]` | |
| 状态 | 含「状态：」的 `<li>` | 「连载中」→`ongoing`，「已完结」→`completed`，附带的更新时间忽略 |
| 作者 | 含「作者：」的 `<li>` 下的 `a` | |
| 标签（分类） | 含「TAG：」的 `<li>` 下 `a[href^="/searchbook/"]` | 自由标签即站点分类；`a[href^="/bookcatalog/"]`（韩漫/日漫等大分类）不入库，仅记入 `extra.broadCategory` |
| 简介 | 含「简介：」的 `<li class="blurb">` | 取「简介：」后的文本 |

- 第一个标签作为主分类 `resource.category`，其余通过 `resource_categories` 关联。

### 章节列表 `a.module-play-list-link`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 阅读链接 | `a.module-play-list-link[href]` | `/readbooks/{id}/{token}.html`，token 作为 `chapterId` |
| 标题 | `title` 属性 | 形如 `{书名}-第1话-副标题`，链接文本被 CSS 截断，必须用 `title`；入库前去掉 `{书名}-` 前缀 |

- DOM 顺序即升序（第1话在最前），无需 reverse。

### 阅读页图片 `img[data-src][data-index]`

- 正文图片均带 `data-src` 与 `data-index`，按 `data-index` 升序即为页码。
- 真实图片地址在 `data-src`（懒加载，`src` 可能为空占位）。
- 图片域名 `img.nnpic.xyz`，由基类统一附加 `Referer: https://rman8.com/` 下载。

## 实现清单

- Parser：`backend/src/scraper/rman8/rman8-parser.ts`
- Service：`backend/src/scraper/rman8/rman8-scraper.service.ts`（`ageRating = ADULT`，`language = 'zh-cn'`，`referer = 'https://rman8.com/'`）
- 注册：`scraper.module.ts`、`scraper.controller.ts`（`POST /scraper/rman8/discover` + `resolveScraperByDomain` 分支 `rman8.com`）、`scraper-initializer.service.ts`、`task.controller.ts`（retry 分支）
- 前端：`frontend/src/api/client.ts` 新增 `discoverRman8`，`BookshelfPage.tsx` 按域名 `rman8.com` 路由
- 目录发现走 `all` 分页；自由标签作为分类在全文抓取时入库
