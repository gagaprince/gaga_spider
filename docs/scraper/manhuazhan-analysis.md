# 漫画栈 (60ti.com) 采集分析文档

> 目标站点：https://www.60ti.com/
> 分析日期：2026-08-14
> 资源类型：漫画 (comic)
> CMS：MCCms（麦站 CMS）

## 页面层级结构

```
分类列表页 (Category List)  -> 全站漫画分页列表
  └─ 漫画详情页 (Detail)     -> 漫画元数据 + 全量章节列表（单页内嵌）
       └─ 章节阅读页 (Reader) -> 漫画图片内容
```

共三层页面，每层职责清晰，可独立采集。

---

## 第一层：分类列表页

### URL 规则

| 页面 | URL 模式 |
|------|---------|
| 第 1 页 | `https://www.60ti.com/category/` |
| 第 N 页 | `https://www.60ti.com/category/page/{N}` |
| 按题材筛选 | `https://www.60ti.com/category/tags/{tagId}` |
| 按状态筛选 | `https://www.60ti.com/category/finish/1`（完结）、`/finish/2`（连载） |
| 按排序 | `https://www.60ti.com/category/order/addtime`（最新）、`/order/hits`（人气） |

全站目录约 4608 页，每页约 20 部作品。

### 页面结构

漫画卡片列表，选择器为 `.comic-list .comic-item`。

```html
<div class="comic-list">
  <div class="comic-item">
    <a href="/comic_yirenzhixia.html" class="comic-cover">
      <img src="https://comic.5um.net/comic/cover/yirenzhixia.webp" alt="一人之下" loading="lazy" />
      <span class="update-badge">连载中</span>
    </a>
    <h3><a href="/comic_yirenzhixia.html" title="一人之下">一人之下</a></h3>
    <p class="comic-author">米橙子</p>
  </div>
</div>
```

### 采集字段

| 字段      | 选择器                         | 说明                                    |
| --------- | ------------------------------ | --------------------------------------- |
| slug      | `a.comic-cover` href 中 `/comic_(.+)\.html` | URL 别名（拼音），作为 sourceId |
| title     | `h3 a` title/text              | 漫画标题                                |
| coverUrl  | `img` src                      | 封面图 CDN 地址                         |
| author    | `p.comic-author` text          | 作者                                    |
| status    | `.update-badge` text           | 「连载中」/「已完结」                    |
| detailUrl | `a.comic-cover` href           | 详情页 URL                              |

### 分页

分页容器 `.pagination`，通过解析其中 `<a>` 的 href 提取最大页码（`/category/page/{N}`）。

---

## 第二层：漫画详情页

### URL 规则

```
https://www.60ti.com/comic_{slug}.html
```

### 页面结构

详情页包含漫画元信息和**全量章节列表**（单页内嵌，无需 AJAX 加载）。

```html
<div class="comic-detail-section">
  <div class="comic-cover-large">
    <img src="https://manga.5um.net/prod/107/107649/107649s.jpg" alt="..." />
  </div>
  <div class="comic-main-info">
    <div class="comic-meta-info">
      <h1>《私密教学》</h1>
      <p class="comic-quick-info">一部好看的都市漫画，由duoman创作...</p>
      <div class="comic-stats">
        <div class="stat-item"><i class="fas fa-star"></i><span>评分：9.9</span></div>
        <div class="stat-item"><i class="fas fa-eye"></i><span>人气：4651</span></div>
        <div class="stat-item"><i class="fas fa-user"></i><span>作者：duoman</span></div>
      </div>
      <div class="comic-tags">
        <span class="tag">都市</span>
        <span class="tag">已完结</span>
      </div>
      <a data-id="21550" class="btn-primary btn--collect ...">收藏</a>
    </div>
  </div>
</div>
<div class="comic-description">
  <p>漫画简介...</p>
</div>
```

章节列表：

```html
<div class="chapter-list" id="chapter-list">
  <div class="chapter-item">
    <a href="/chapter_21550_1602266.html">第1话 私密教学</a>
  </div>
  <div class="chapter-item">
    <a href="/chapter_21550_1602267.html">第2话 私密教学</a>
  </div>
</div>
```

### 采集字段

| 字段      | 选择器 / 来源                              | 说明                                    |
| --------- | ------------------------------------------ | --------------------------------------- |
| title     | `.comic-meta-info h1` text                 | 去除《》括号                            |
| comicId   | `[data-id]` 属性                           | 数字 ID（存入 extra，不作为 sourceId）   |
| coverUrl  | `.comic-cover-large img` src               | 封面大图                                |
| summary   | `.comic-description p` text                | 漫画简介                                |
| rating    | `.stat-item` 中「评分：X.X」提取数字        | 评分                                    |
| authors   | `.stat-item` 中「作者：XXX」提取            | 作者名                                  |
| genres    | `.comic-tags .tag`（排除状态标签）          | 类型标签                                |
| status    | `.comic-tags .tag` 包含「已完结」→ completed / 否则 ongoing | 状态 |

### 章节列表

| 字段      | 选择器 / 来源                              | 说明                              |
| --------- | ------------------------------------------ | --------------------------------- |
| chapterId | `a` href 中 `/chapter_\d+_(\d+)\.html`     | 章节唯一标识                      |
| title     | `a` text                                   | 章节标题                          |
| viewerUrl | `a` href                                   | 阅读页 URL                        |

> 章节为**正序排列**（第1话在前），无需反转。

---

## 第三层：章节阅读页

### URL 规则

```
https://www.60ti.com/chapter_{comicId}_{chapterId}.html
```

### 页面结构

阅读页所有图片以内嵌方式输出在 HTML 中，真实 URL 存储在 `data-src` 属性。

```html
<img src="https://manga.5um.net/prod/107/107649/3577676/1_ab7387.jpg"
     class="comic-image lazyload"
     data-src="https://manga.5um.net/prod/107/107649/3577676/1_ab7387.jpg" />
```

### 采集字段

| 字段       | 选择器                              | 说明                   |
| ---------- | ----------------------------------- | ---------------------- |
| orderIndex | 序号（从 1 递增）                   | 图片在章节中的顺序     |
| imageUrl   | `img.comic-image` `data-src`        | 图片 CDN 地址          |

### 图片 CDN

- 域名：`manga.5um.net` / `comic.5um.net`
- **无需 Referer**：实测有无 Referer 均返回 200
- 扩展名：`.jpg` / `.webp`

---

## 反爬情况

| 项目         | 情况                                                    |
| ------------ | ------------------------------------------------------- |
| TLS 指纹检测 | 无，Python urllib 直接 200                              |
| JS 质询      | 无，页面为纯服务端渲染                                  |
| Cloudflare   | 无                                                      |
| 登录/Cookie  | 不需要                                                  |
| 图片 Referer | 不需要                                                  |
| 限速         | 未检测到明显限制，保守设为 1000ms / 请求                |

---

## 与动漫嗨的关键差异

| 维度         | 动漫嗨                          | 漫画栈 (60ti)                           |
| ------------ | ------------------------------- | --------------------------------------- |
| 资源标识     | 数字 comicId 在 URL 路径        | 拼音 slug 在 URL，数字 ID 在 data-id 属性 |
| sourceId     | 数字 ID                         | slug（拼音别名）                         |
| 章节排序     | 降序（需反转）                  | 正序（无需反转）                         |
| 图片选择器   | `.lazyBox img.lazyload` data-original | `img.comic-image` data-src          |
| 分页格式     | `/list/.../{N}.html`            | `/category/page/{N}`（无后缀）           |
| 列表卡片     | `ul.mh-list > li`               | `div.comic-list > div.comic-item`        |
| 发现策略     | 遍历 region×filter×sort 组合    | 直接遍历 `/category/` 全部分页           |

---

## 采集策略

1. **全站发现**：遍历 `/category/` 第 1～N 页（约 4608 页），逐页解析 `.comic-item` 卡片，以 slug 为 sourceId 入库 + 下载封面
2. **单本抓取**：访问详情页 `/comic_{slug}.html`，解析元数据 + 全量章节列表（正序），逐章抓取阅读页图片
3. **增量更新**：图片下载前检查本地文件是否存在，已存在跳过；DB 记录按 orderIndex 增量更新
4. **任务管理**：复用通用 TaskService，支持停止/重试，重试时按 sourceSite 自动路由

---

## 实现文件

| 文件 | 说明 |
|------|------|
| `backend/src/scraper/manhuazhan/manhuazhan-parser.ts` | cheerio 解析器 |
| `backend/src/scraper/manhuazhan/manhuazhan-scraper.service.ts` | 抓取服务（继承 BaseComicScraper） |
| `backend/src/scraper/scraper.module.ts` | 模块注册 |
| `backend/src/scraper/scraper.controller.ts` | 路由 `POST /scraper/manhuazhan/discover` |
| `backend/src/task/task.controller.ts` | 重试路由 |
| `frontend/src/api/client.ts` | `discoverManhuazhan` API |
| `frontend/src/components/BookshelfPage.tsx` | 源站下拉框选项 |
