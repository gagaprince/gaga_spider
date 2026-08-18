# 動漫戲說 (comic.acgn.cc) 采集分析文档

> 目标站点：https://comic.acgn.cc/
> 分析日期：2026-08-18
> 资源类型：漫画 (comic)
> 语言：繁體中文 (`zh-hant`)
> 分级：全年龄段 (`all`)

## 站点信息

| 维度 | 说明 |
|---|---|
| 域名 | `comic.acgn.cc` |
| 名称 | 動漫戲說 (ACGN.cc) |
| 资源标识 | slug（拼音别名，如 `sishen`、`haizeiwang`） |
| 封面 CDN | `comic.acgn.cc/logo/{首字母}/{slug}.jpg` |
| 章节图 CDN | `img.acgn.cc/img/{目录ID}/{chapterId}/{N}.jpg`，Cloudflare，无需 Referer |
| 反爬 | 无 TLS 指纹检测、无 JS 挑战、无登录，Python urllib 直连即可 |
| 限速 | 1000ms / 请求 |

## 页面层级结构

```
分类列表页 (Category List)  -> 全站漫画分页列表（33 个分类）
  └─ 漫画详情页 (Detail)     -> 漫画元数据 + 全量章节列表（单页内嵌）
       └─ 章节阅读页 (Reader) -> 漫画图片内容
```

## 第一层：分类列表页

### URL 规则

| 页面 | URL 模式 |
|------|---------|
| 分类首页 | `https://comic.acgn.cc/cate-{categoryId}.htm` |
| 第 N 页 | `https://comic.acgn.cc/cate-{categoryId}.htm?page={N}` |

共 33 个分类（cate-1 ~ cate-33），每页约 36 部作品。

### 页面结构

漫画卡片选择器：`div.content_block`

```html
<div class="content_block">
  <div class="list_l">
    <a href="/view-136251.htm" title="死神[第530話]">
      <img src="/logo/s/sishen.jpg" alt="死神" class="thumb" />
    </a>
    <span class="last">第530話</span>
  </div>
  <div class="list_r">
    <h2><a href="https://comic.acgn.cc/manhua-sishen.htm" title="死神">死神</a></h2>
    [ 2013-03-13 ]
    <p>漫画简介...</p>
  </div>
</div>
```

### 采集字段

| 字段 | 选择器 | 说明 |
|------|--------|------|
| slug | `.list_r h2 a` href 中 `/manhua-(.+)\.htm` | 拼音别名，作为 sourceId |
| title | `.list_r h2 a` title/text | 漫画标题 |
| coverUrl | `.list_l img.thumb` src | 封面相对路径，需拼接 baseUrl |
| latestChapter | `.list_l .last` text | 最新章节标题 |
| updateDate | `.list_r` 文本中 `[YYYY-MM-DD]` | 更新日期 |
| summary | `.list_r p` text | 简介 |

### 分页

分页容器 `div.pagination`，最大页码从 `a[rel="last"]` 的 href 中提取 `?page=N`。

## 第二层：漫画详情页

### URL 规则

```
https://comic.acgn.cc/manhua-{slug}.htm
```

### 元数据字段

| 字段 | 选择器 | 说明 |
|------|--------|------|
| title | `div.list_navbox h3 a` 或 `#subheader h1` | 漫画标题 |
| authors | `li.mss:contains("作者") span a` | 作者列表 |
| status | `li.mss:contains("狀態") span` | 連載中/已完結 |
| genres | `li.mss:contains("分類") span a` | 分类（可多个） |
| coverUrl | `#item_intro .m img` src | 封面图 |
| summary | `dl.gameshows dd` 文本 | 漫画简介 |

### 章节列表

```html
<div id="comic_chapter" class="box_info2">
  <ul>
    <li><a href="view-1002.htm" title="死神423話漫畫" target="_blank">423話</a></li>
    ...
  </ul>
</div>
```

- 章节 ID 从 href 中提取 `view-(\d+)\.htm`
- 章节为**降序排列**（最新在前），需 `reverse()` 为升序

### 注意事项

- 部分漫画可能返回 `<script>alert('資料已刪除!')</script>`，需检测并跳过

## 第三层：章节阅读页

### URL 规则

```
https://comic.acgn.cc/view-{chapterId}.htm
```

### 页面结构

图片 URL 在 `div.pic` 的 `_src` 属性中（非标准 `src`）：

```html
<div id="pic_list">
  <div id="p0" class="pic loading" _src="https://img.acgn.cc/img/1100/1002/1.jpg" style="display:none;"></div>
  <div id="p1" class="pic loading" _src="https://img.acgn.cc/img/1100/1002/2.jpg" style="display:none;"></div>
  ...
</div>
```

选择器：`#pic_list div.pic[_src]`

## 采集策略

1. **全站发现**：遍历 33 个分类的所有分页，解析 `div.content_block` 卡片，以 slug 去重入库 + 下载封面
2. **单本抓取**：访问详情页获取元数据 + 全量章节列表（反转升序），逐章访问阅读页下载图片
3. **增量更新**：图片下载前检查本地文件是否存在；章节按 orderIndex 增量更新
4. **任务管理**：复用通用 TaskService，支持停止/重试

## 实现文件

| 文件 | 说明 |
|------|------|
| `backend/src/scraper/acgn/acgn-parser.ts` | cheerio 解析器 |
| `backend/src/scraper/acgn/acgn-scraper.service.ts` | 抓取服务（继承 BaseComicScraper） |
| `backend/src/scraper/scraper.module.ts` | 模块注册 |
| `backend/src/scraper/scraper.controller.ts` | 路由 `POST /scraper/acgn/discover` |
| `backend/src/scraper/scraper-initializer.service.ts` | 启动时源站初始化 |
| `backend/src/task/task.controller.ts` | 重试路由 |
| `frontend/src/api/client.ts` | `discoverAcgn` API |
| `frontend/src/components/BookshelfPage.tsx` | 源站下拉框路由 |
