# 鸟鸟韩漫 (nnhm7.com) 抓取分析

> 成人漫画源站，分级为 `adult`。

## 站点信息

| 维度 | 说明 |
|---|---|
| 域名 | `nnhm7.com` |
| 名称 | 鸟鸟韩漫 |
| 语言 | 繁體中文 (`zh-hant`) |
| 分级 | 成人限定 (`adult`) |
| 资源标识 | slug（拼音化书名，如 `bu-chun-xi-xue-gui`） |
| 图片 CDN | `img.nnpic.xyz`，无防盗链、无 Referer 校验、CORS 全开 |
| 限速 | 1000ms / 请求 |
| 反爬 | Cloudflare CDN，但 HTML 服务端直出，无 JS 挑战 / TLS 指纹拦截，Python urllib 直连即可 |

## URL 规律

| 页面 | URL 格式 |
|---|---|
| 列表页 | `https://nnhm7.com/comics/all/ob/time/st/all/page/{N}` |
| 详情页 | `https://nnhm7.com/comic/{slug}.html` |
| 阅读页 | `https://nnhm7.com/comic/{slug}/chapter-{chapterId}.html` |

- 列表共约 146 页，每页 18 部，总计约 2,628 部
- `chapterId` 为数字（如 `82187`），章节顺序以页面中的列表顺序为准
- 备用域名（页面公告中提及）：`nnhm95.com`、`nnhm93.com` 等，换域名只需修改 `baseUrl`

## 页面选择器

### 列表卡片 `ul.col_3_1 > li`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 详情链接 | `a.ImgA[href]` | 提取 `/comic/{slug}.html` 中的 slug |
| 标题 | `a.ImgA[title]` | 完整标题（`a.txtA` 文本可能被截断） |
| 封面 | `a.ImgA img[src]` | jpg 格式 |
| 更新日期 | `span.info` | 如 `2026-08-14` |

### 分页 `.pagination-wrap a`

- 最后一页链接形如 `/comics/all/ob/time/st/all/page/146`
- 解析最大页码作为总页数

### 详情页 `.Introduct`

| 字段 | 选择器 | 说明 |
|---|---|---|
| 标题 | `.sub_r h1` | 去掉首尾《》 |
| 封面 | `#Cover img[src]` | |
| 作者 | `.sub_r .txtItme`（不含分类链接、不含 `.date`） | `&`/逗号分隔多作者 |
| 分类 | `.sub_r .txtItme a[href^="/comics/"]` | 正妹、肉慾、浪漫等 |
| 状态 | `.sub_r .date` | 含「连载中」→ ongoing，「已完結」→ completed |
| 简介 | `.txtDesc` | 去掉「介绍:」前缀 |

### 章节列表 `ul#mh-chapter-list-ol-0 > li > a`

- HTML 中为**降序**（最新章节在前），抓取时 `reverse()` 为升序
- `href` 提取 `/chapter-(\d+)\.html` 作为 chapterId
- 标题取 `span` 文本

### 阅读页图片 `#m_r_imgbox_0 img[data-src]`

- 全部服务端渲染，`data-index` 标识顺序
- 原图地址在 `data-src`（页面用 JS 懒加载替换为 `src`）
- 备用 CDN 池：`img.nnpic.xyz`、`p4.nnpic.xyz` 等，直接用主域名即可

## 文件存储

成人内容与全年龄段物理隔离，统一存放在 `resourcePath/18/` 下：

```
resourceFiles/18/
├── covers/
│   └── other/{slug}.jpg
├── images/
│   └── {slug}/{chapterOrderIndex}/0001.jpg
└── pdfs/
    └── {title}.pdf / chapters_{id}/
```

由 `BaseComicScraper.resourceSubDir`（返回 `'18'`）自动处理，scraper 无需关心路径拼接。
