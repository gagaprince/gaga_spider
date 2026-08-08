# Webtoons 网站采集分析文档

> 目标站点：https://www.webtoons.com/zh-hant/genres
> 分析日期：2026-08-08
> 资源类型：漫画 (comic)

## 页面层级结构

```
分类页 (Genres)          -> 列出所有分类 + 每个分类下的漫画卡片
  └─ 漫画详情页 (List)    -> 漫画元数据 + 章节列表
       └─ 章节阅读页 (Viewer) -> 漫画图片内容
```

共三层页面，每层职责清晰，可独立采集。

---

## 第一层：分类页

### URL 规则

| 页面 | URL 模式 |
|------|---------|
| 分类总览 | `https://www.webtoons.com/zh-hant/genres` |
| 单分类列表 | `https://www.webtoons.com/zh-hant/genres/{genre_slug}?sortOrder={SORT}` |

### URL 参数

**genre_slug**（繁中区 23 个分类）：

| slug | 含义 | slug | 含义 |
|------|------|------|------|
| action | 動作 | horror | 恐怖 |
| adaptation | 改編 | martial_arts | 武俠 |
| bl_gl | BL/GL | mystery | 推理 |
| city_office | 都市/職場 | romance | 戀愛 |
| comedy | 喜劇 | romance_m | 戀愛(男向) |
| drama | 劇情 | school | 校園 |
| eastern_palace | 東方宮廷 | shonen | 少年 |
| epub | 電子書 | slice_of_life | 日常 |
| fantasy | 奇幻 | thriller | 驚悚 |
| heartwarming | 治癒 | time_slip | 穿越 |
| local | 在地 | web_novel | 網路小說 |
| | | western_palace | 西方宮廷 |

**sortOrder**（排序方式，3 种）：

| 值 | 含义 |
|----|------|
| `MANA` | 熱門排序（默认） |
| `LIKEIT` | 愛心排序 |
| `UPDATE` | 最近更新 |

### 页面结构

分类总览页将所有分类以 Tab 形式展示在页面顶部，页面内同时加载所有分类的漫画卡片（单页约 898 部作品）。

每个分类列表页仅展示该分类下的作品，支持按上述 3 种方式排序。

### 需要关注的信息

每个漫画卡片（`<a class="link _genre_title_a">`）包含：

| 信息 | HTML 位置 | 数据属性/选择器 | 对应数据库字段 |
|------|-----------|----------------|---------------|
| 作品 ID | `<a>` 标签 | `data-title-no` | `resource_sources.source_id` |
| 分类 | `<a>` 标签 | `data-genre` | `categories.name` |
| 语言 | `<a>` 标签 | `data-language-code` | `resources.language` |
| 作品列表 URL | `<a>` 标签 | `href` | `resource_sources.source_url` |
| 封面图 | `<img>` | `src` | `resources.cover_url` |
| 标题 | `<strong class="title">` | 文本 | `resources.title` |
| 作者 | `<div class="author">` | 文本 | `authors.name` |
| 爱心数 | `<div class="view_count type_like">` | 文本（如 "1.5M"） | `resources.extra.likeCount` |
| 年龄限制 | `<div class="image_wrap">` | `data-title-unsuitable-for-children` | `resources.extra.adult` |

---

## 第二层：漫画详情页（章节列表）

### URL 规则

```
https://www.webtoons.com/zh-hant/{genre}/{slug}/list?title_no={title_no}&page={page}
```

- `{genre}`：分类 slug（如 `romance`）
- `{slug}`：作品 URL 别名（如 `trapped-together-with-my-nemesis`）
- `{title_no}`：作品唯一 ID
- `{page}`：章节分页（每页约 10 话）

### 页面结构

页面分为两大区域：
- **顶部信息区**：漫画元数据（标题、作者、简介、封面、状态等）
- **底部章节列表**：`<ul id="_listUl">` 内的 `<li>` 项，每项一话

### 需要关注的信息

**元数据区域：**

| 信息 | HTML 位置 | 选择器 | 对应数据库字段 |
|------|-----------|--------|---------------|
| 标题 | `<h1 class="subj">` | 文本 | `resources.title` |
| 作者 | `<div class="author_area">` | 文本（可能多人，逗号分隔） | `authors.name` (type=author/artist) |
| 分类 | `<h2 class="genre">` | 文本 | `categories.name` |
| 简介 | `<p class="summary">` | 文本 | `resources.summary` |
| 封面图 | `<span class="thmb"> <img>` | `src` | `resources.cover_url` |
| 状态 | 徽章 | `class="badge"` 或 `UP` 文本 | `resources.status` (ongoing/completed) |
| 更新日 | 状态区文本 | 如 `UP EVERY MONDAY` | `resources.extra.updateDay` |
| 总浏览数 | `<em class="grade_num">` | 文本（如 "27.9M"） | `resources.extra.viewCount` |
| 订阅数 | `<p class="grade_area">` | subscribe 后的数字 | `resources.extra.subscribeCount` |
| 评分 | 评分区 | 数字 | `resources.rating` |

**章节列表（每个 `<li class="_episodeItem">`）：**

| 信息 | HTML 位置 | 选择器/属性 | 对应数据库字段 |
|------|-----------|------------|---------------|
| 章节序号 | `<li>` | `data-episode-no` | `chapters.order_index` |
| 章节标题 | `<span class="subj">` | 文本 | `chapters.title` |
| 阅读 URL | `<a class="detail_list_link">` | `href` | `chapters.source_url` |
| 缩略图 | `<img>` | `src` | `chapters.extra.thumbnail` |
| 上传日期 | 日期区文本 | 如 `2023.02.11` | `chapters.extra.publishedAt` |
| 爱心数 | 爱心区 | 数字 | `chapters.extra.likeCount` |

---

## 第三层：章节阅读页（图片内容）

### URL 规则

```
https://www.webtoons.com/zh-hant/{genre}/{slug}/{episode_slug}/viewer?title_no={title_no}&episode_no={episode_no}
```

- `{episode_slug}`：章节 URL 别名（如 `ep-0-prologue`）
- `{episode_no}`：章节序号

### 页面结构

图片容器为 `<div id="_imageList">`，内部包含若干 `<img class="_images">` 标签。

**关键技术点：图片懒加载**

- `<img>` 的 `src` 属性是透明占位图 `bg_transparency.png`
- 真实图片 URL 存在 `data-url` 属性中
- 采集时需读取 `data-url` 而非 `src`

单章图片数量通常 30-100+ 张。

### 需要关注的信息

| 信息 | HTML 位置 | 选择器/属性 | 对应数据库字段 |
|------|-----------|------------|---------------|
| 图片 URL | `<img class="_images">` | `data-url` | `chapter_images.source_url` |
| 图片顺序 | DOM 顺序 | 第 N 个 `<img>` | `chapter_images.order_index` |
| 章节标题 | `<h1 class="subj">` 或标题区 | 文本 | `chapters.title`（校验） |
| 上/下话导航 | 导航区 | `href` 中的 `episode_no` | 用于发现相邻章节 |

---

## 数据库覆盖度评估

### 完全覆盖

| 数据 | 数据库表/字段 |
|------|-------------|
| 作品标题/简介/封面/状态/语言 | `resources` |
| 作品来源 ID / URL / 原始数据 | `resource_sources` |
| 作者/画师 | `authors` + `resource_authors` |
| 分类 | `categories` + `resource_categories` |
| 章节序号/标题/来源 URL | `chapters` |
| 章节图片 URL/顺序/本地路径 | `chapter_images` |
| 源站配置/抓取规则 | `source_sites.config` (JSON) |
| 文件去重 | `files.file_hash` |

### 需要 JSON 扩展字段兜底

以下信息无专属列，但可通过 `extra` (JSON) 字段存储：

| 数据 | 存储位置 | 字段路径 |
|------|---------|---------|
| 总浏览数 | `resources.extra` | `extra.viewCount` |
| 订阅数 | `resources.extra` | `extra.subscribeCount` |
| 更新星期 | `resources.extra` | `extra.updateDay` |
| 年龄限制标记 | `resources.extra` | `extra.adult` |
| 章节缩略图 | `chapters` 需新增 `extra` 列 或存 `files` 表 | - |
| 章节发布日期 | 同上 | - |
| 章节爱心数 | 同上 | - |

> **建议**：给 `chapters` 表增加一个 `extra JSON` 列，与 `resources.extra` 对齐，存放章节级扩展数据（缩略图、发布日期、爱心数等）。

### 缺失项

| 缺失 | 影响 | 建议 |
|------|------|------|
| `chapters` 表无 `extra` JSON 列 | 章节级扩展数据无处存放 | 加列 `extra JSON NULL` |
| `chapters` 表无 `published_at` 列 | 无法按原始发布时间排序/增量判断 | 加列 `published_at DATETIME NULL` |
| 章节缩略图无独立字段 | 缩略图只能放 `files` 表或丢失 | 可接受，用 `files` 表 `file_type=thumbnail` |

---

## 采集策略建议

### 发现阶段 (discover)

1. 从分类总览页 `https://www.webtoons.com/zh-hant/genres` 抓取所有分类 Tab
2. 对每个分类，用 `sortOrder=UPDATE` 排序抓取漫画卡片
3. 提取每个卡片的 `title_no`，去重后入库为 `resources` + `resource_sources`

### 全量抓取阶段 (full)

1. 遍历所有 `title_no`，访问详情页
2. 提取漫画元数据（标题/作者/简介/状态/分类等）
3. 翻页抓取全部章节列表（`page=1,2,3...`），入 `chapters` 表
4. 对每个章节访问阅读页，提取 `data-url` 图片列表，入 `chapter_images` 表

### 增量抓取阶段 (incremental)

1. 用 `sortOrder=UPDATE` 重新抓分类页，发现新作品
2. 对已有作品，访问详情页第 1 页，比对 `episode_no` 与 `resource_sources.last_chapter_order`
3. 仅抓取新增章节的图片

### 反爬注意事项

- curl / Node fetch 会被地域限制拦截（返回 855 字节错误页），需使用完整浏览器请求头
- Python urllib 带标准浏览器 User-Agent 可正常抓取
- 图片有防盗链（`Referer` 检查），下载图片时需携带 `Referer: https://www.webtoons.com`
- 图片禁止右键/拖拽（`ondragstart`/`oncontextmenu` 返回 false），但不影响程序读取 `data-url`
- 建议请求间隔 ≥ 1 秒，遵守 `source_sites.rate_limit`
