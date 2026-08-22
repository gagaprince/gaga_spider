# 蚂蚁搬运网 (antbyw.com) 采集分析文档

> 目标站点：https://www.antbyw.com/
> 分析日期：2026-08-19
> 资源类型：漫画 (comic)
> 分级：全年龄段 (`all`)
> CMS：Discuz! + `jameson_manhua` 漫画插件

## 站点信息

| 维度 | 说明 |
|---|---|
| 域名 | `www.antbyw.com` |
| 名称 | 蚂蚁搬运网（tapmanga） |
| 语言 | 繁體中文 (`zh-hant`) |
| 分级 | 全年龄段 (`all`) |
| 资源标识 | 数字 `kuid`（如 `187547`） |
| 章节标识 | 数字 `zjid`（如 `1604073`） |
| 图片 CDN | `imgmh3.antbyw.com`，无防盗链、无需 Referer、CORS 全开 |
| 限速 | 500ms / 请求 |
| 反爬 | Cloudflare CDN，但 HTML 服务端直出，无 JS 挑战 / TLS 指纹拦截，Python urllib 直连即可 |

## URL 规律

| 页面 | URL 格式 |
|---|---|
| 目录页 | `https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=ku&odfie=addtime&order=desc&page={N}` |
| 详情页 | `https://www.antbyw.com/plugin.php?id=jameson_manhua&c=index&a=bofang&kuid={kuid}` |
| 阅读页 | `https://www.antbyw.com/plugin.php?id=jameson_manhua&a=read&kuid={kuid}&zjid={zjid}&page={N}` |

- 目录共约 **1219 页**，每页约 210 部作品，总计约 25 万+ 条卡片（含跨页重复）
- 阅读页图片分页输出，每页 **5 张**，需遍历 `page=1..N` 拼接整章图片（页脚标注「/ N 页」）

## 页面层级

```
目录列表页 (a=ku)      -> 全站漫画分页卡片
  └─ 详情页 (a=bofang) -> 漫画元数据 + 全量章节列表（降序，需反转）
       └─ 阅读页 (a=read) -> 图片 JS 数组（分页，每页 5 张）
```

## 第一层：目录列表页

### 页面结构

漫画卡片，选择器为 `div.uk-card.mbm.uk-text-center`。

```html
<div class="uk-card mbm uk-text-center">
  <div class="uk-card-wrap pt6 pb6">
    <div class="uk-card-media-top uk-inline">
      <a href="./plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=187547">
        <img src="https://imgmh3.antbyw.com/mh_cover/48970.jpg" alt="">
      </a>
    </div>
    <div>
      <p class="mt5 mb5 uk-text-truncate uk-text-center xs2">
        <a href="./plugin.php?id=jameson_manhua&c=index&a=bofang&kuid=187547">我虽身为平民…</a>
      </p>
    </div>
  </div>
</div>
```

### 采集字段

| 字段 | 选择器 | 说明 |
|---|---|---|
| kuid | `a[href*="a=bofang"]` href 中 `kuid=(\d+)` | 资源标识，作为 sourceId |
| title | `p a[href*="a=bofang"]` 文本 | 漫画标题 |
| coverUrl | `div.uk-card-media-top img[src]` | 封面图 CDN 地址 |
| detailUrl | `a[href*="a=bofang"]` href | 绝对化后的详情页地址 |

### 分页

- 分页容器 `div.pg`，最后一页链接 `a.last` 的 href 含 `page=1219`
- 兜底解析：`div.pg` 文本中的「/ 1219 页」

## 第二层：详情页

### 元数据 `.bofangwrap`

| 字段 | 选择器 | 说明 |
|---|---|---|
| title | `h3.uk-heading-line` | 漫画标题 |
| coverUrl | `div.uk-width-medium img[src]` | 封面图 |
| authors | `div.cl.uk-text-small:contains("漫畫作者")` 内的 `a` 文本 | 作者（无链接时取冒号后文本） |
| genres | `div.cl.xs1 a.uk-label[href*="category_id"]` | 分类（如「百合」）。区域/受众/年份等其他 label 不入分类 |
| status | `div.cl.xs1 a.uk-label` 含「已完结/完結」→ completed，「连载/連載」→ ongoing | 状态 |
| summary | — | 该站无简介字段，留空 |

### 章节列表 `div.muludiv a.zj-container[href*="a=read"]`

- HTML 中为**降序**（最新章节在前），抓取时 `reverse()` 为升序
- `href` 提取 `zjid=(\d+)` 作为 chapterId
- 按钮文本即章节标题（如「第35话」）

## 第三层：阅读页

图片以内嵌 JS 数组形式输出在页面顶部：

```javascript
let urls = [
  "https://imgmh3.antbyw.com/ps2/b/bw-15571/.../0001.jpg.webp",
  "https://imgmh3.antbyw.com/ps2/b/bw-15571/.../0002.jpg.webp"
];
```

- 用正则 `let\s+urls\s*=\s*(\[[\s\S]*?\]);` 提取并 `JSON.parse`
- 每页 5 张，整章需遍历 `page=1..N`（总页数从页脚「/ N 页」解析）并按顺序拼接
- 图片为 `.jpg.webp` 格式，框架按 URL 扩展名保存

### 图片 CDN

- 域名：`imgmh3.antbyw.com`
- **无需 Referer**：实测无 Referer 直接返回 200，`Access-Control-Allow-Origin: *`

## 反爬情况

| 项目 | 情况 |
|---|---|
| TLS 指纹检测 | 无，Python urllib 直接 200 |
| JS 质询 | 无，页面为纯服务端渲染 |
| Cloudflare | CDN 层但无拦截 |
| 登录/Cookie | 不需要 |
| 图片 Referer | 不需要 |
| 限速 | 保守设为 500ms / 请求 |

## 采集策略

1. **全站发现**：遍历 `a=ku` 第 1～1219 页，逐页解析 `div.uk-card` 卡片，以 `kuid` 为 sourceId 入库 + 下载封面
2. **单本抓取**：访问详情页 `a=bofang&kuid=`，解析元数据 + 章节列表（反转升序），逐章遍历阅读页分页抓取图片
3. **增量更新**：图片下载前检查本地文件是否存在，已存在跳过；DB 记录按 orderIndex 增量更新
4. **任务管理**：复用通用 TaskService，支持停止/重试，重试时按 sourceSite 自动路由

## 实现文件

| 文件 | 说明 |
|---|---|
| `backend/src/scraper/antbyw/antbyw-parser.ts` | cheerio 解析器 |
| `backend/src/scraper/antbyw/antbyw-scraper.service.ts` | 抓取服务（继承 BaseComicScraper，ageRating=all，rateLimit=500ms） |
| `backend/src/scraper/scraper.module.ts` | 模块注册 |
| `backend/src/scraper/scraper.controller.ts` | 路由 `POST /scraper/antbyw/discover` + 域名路由 |
| `backend/src/scraper/scraper-initializer.service.ts` | 启动时自动登记源站 |
| `frontend/src/api/client.ts` | `discoverAntbyw` API |
| `frontend/src/components/BookshelfPage.tsx` | 目录抓取下拉分支 |
