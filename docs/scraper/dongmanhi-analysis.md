# 动漫嗨网站采集分析文档

> 目标站点：https://www.dongmanhi.com/
> 分析日期：2026-08-10
> 资源类型：漫画 (comic)

## 页面层级结构

```
分类列表页 (List)        -> 按地区/题材筛选的漫画卡片列表，支持分页
  └─ 漫画详情页 (Detail)  -> 漫画元数据 + 全量章节列表（单页内嵌）
       └─ 章节阅读页 (Reader) -> 漫画图片内容
```

共三层页面，每层职责清晰，可独立采集。

---

## 第一层：分类列表页

### URL 规则

| 页面 | URL 模式 |
|------|---------|
| 全部分类 | `https://www.dongmanhi.com/list/0-0-0-0/` |
| 第 N 页 | `https://www.dongmanhi.com/list/0-0-0-0/{N}.html` |
| 地区筛选 | `https://www.dongmanhi.com/list/{region}-{category}-{0}-{sort}/` |
| 搜索结果 | `https://www.dongmanhi.com/search?title={关键词}` |

### URL 参数

URL 路径格式为 `/list/{region}-{category}-{?}-{sort}/{page}.html`

**region**（地区，6 种）：

| 值 | 含义 |
|----|------|
| `0` | 全部 |
| `1` | 日漫 |
| `2` | 港台 |
| `3` | 其他 |
| `4` | 国漫 |
| `5` | 美漫 |
| `6` | 韩漫 |

**sort**（排序，2 种）：

| 值 | 含义 |
|----|------|
| `0` | 更新时间 |
| `1` | 人气 |

**page**（分页）：

- 第 1 页无后缀（`/list/0-0-0-0/`）
- 第 2 页起为 `{N}.html`（`/list/0-0-0-0/2.html`）
- 每页 24 部作品

### 页面结构

漫画卡片列表，选择器为 `ul.mh-list > li > div.mh-item`。

```html
<ul class="mh-list">
  <li>
    <div class="mh-item">
      <a href="https://www.dongmanhi.com/manhua/5316/">
        <img class="mh-cover" src="https://img.dongmanhi.com/uploads/...jpg" alt="火影忍者在线漫画">
      </a>
      <div class="mh-item-detali">
        <h2 class="title">
          <a href="https://www.dongmanhi.com/manhua/5316/" title="火影忍者在线漫画">火影忍者</a>
        </h2>
        <p class="chapter"><span>完结</span></p>
      </div>
    </div>
  </li>
</ul>
```

### 采集字段

| 字段       | 选择器                         | 说明                          |
| ---------- | ------------------------------ | ----------------------------- |
| comicId    | `a` href 中 `/manhua/(\d+)/`   | 漫画唯一标识                  |
| title      | `h2.title a` 文本              | 去除「在线漫画」后缀          |
| coverUrl   | `img.mh-cover` src             | 封面图 CDN 地址               |
| status     | `p.chapter span` 文本          | 「连载」/「完结」             |
| detailUrl  | `a` href                       | 详情页 URL                    |

### 分页

分页容器 `.page-pagination`，通过解析其中 `<a>` 的 href 提取最大页码（`{N}.html`）。

搜索结果页复用相同的 `ul.mh-list` 卡片结构，解析逻辑完全一致。

---

## 第二层：漫画详情页

### URL 规则

```
https://www.dongmanhi.com/manhua/{comicId}/
```

### 页面结构

详情页包含漫画元信息和**全量章节列表**（单页内嵌，无需 AJAX 加载）。

```html
<div class="detail-info">
  <img src="..." class="detail-info-cover">
  <p class="detail-info-title">火影忍者</p>
  <p class="detail-info-stars">
    <img class="detail-info-star"> ...
    <span>8.0分</span>
  </p>
  <p class="detail-info-tip">
    <span>作者：岸本齐史</span>
    <span>状态：<span>完结</span></span>
    <span>类型：<span class="item">热血,冒险,少年</span></span>
  </p>
</div>
<div class="detail-info-2">
  <p class="detail-info-content">漫画简介...</p>
</div>
```

章节列表：

```html
<ul id="mh-chapter-list-ol-0">
  <li class="detail-list-form-item">
    <a href="https://www.dongmanhi.com/manhua/5316/145423.html" title="火影忍者第710话" target="_blank">第710话</a>
  </li>
  <!-- 更多章节... -->
</ul>
```

> 页面显示「完结 | 共217章节」，章节数可通过正则 `共(\d+)章节` 提取。

### 采集字段

| 字段          | 选择器 / 来源                        | 说明                                    |
| ------------- | ------------------------------------- | --------------------------------------- |
| title         | `p.detail-info-title` 文本            | 漫画标题                                |
| coverUrl      | `img.detail-info-cover` src           | 封面图                                  |
| summary       | `p.detail-info-content` 文本          | 漫画简介                                |
| rating        | `p.detail-info-stars span` 文本       | 评分（如「8.0分」，提取数字）           |
| authors       | `p.detail-info-tip` 中正则提取        | 作者，逗号分隔                          |
| status        | `p.detail-info-tip` 中正则提取        | 完结→completed / 连载→ongoing           |
| genres        | `p.detail-info-tip` 中正则提取        | 类型标签，逗号分隔                      |
| chapterCount  | 正则 `共(\d+)章节`                    | 总章节数                                |

### 章节列表

| 字段      | 选择器 / 来源                       | 说明                              |
| --------- | ----------------------------------- | --------------------------------- |
| chapterId | `a` href 中 `/(\d+)\.html`          | 章节唯一标识                      |
| title     | `a` title 属性                      | 章节标题                          |
| viewerUrl | `a` href                            | 阅读页 URL                        |

> **重要**：页面章节为降序排列（最新在前），抓取时自动反转为升序（最早在前），保证 orderIndex 从 1 递增。

---

## 第三层：章节阅读页

### URL 规则

```
https://www.dongmanhi.com/manhua/{comicId}/{chapterId}.html
```

### 页面结构

阅读页所有图片以懒加载方式内嵌在 HTML 中，真实 URL 存储在 `data-original` 属性。

```html
<div class="readForm reader-img-con" id="showimage">
  <div class="item" id="cp_img">
    <div class="lazyBox">
      <img class="lazyload"
           src="data:image/gif;base64,..."
           data-original="https://img.dongmanhi.com/h/hyrz/710/0001.png"
           title="火影忍者图0">
    </div>
    <div class="lazyBox">
      <img class="lazyload"
           src="data:image/gif;base64,..."
           data-original="https://img.dongmanhi.com/h/hyrz/710/0002.png"
           title="火影忍者图1">
    </div>
    <!-- 更多图片... -->
  </div>
</div>
```

### 采集字段

| 字段       | 选择器                         | 说明                              |
| ---------- | ------------------------------ | --------------------------------- |
| orderIndex | 序号（从 1 递增）              | 图片在章节中的顺序                |
| imageUrl   | `#cp_img .lazyBox img.lazyload` `data-original` | 图片 CDN 地址         |

### 图片 CDN

- 域名：`img.dongmanhi.com`
- **无需 Referer**：实测有无 Referer 均返回 200，可直接下载
- 扩展名混用 `.png` / `.jpg`，下载时按 URL 路径原始扩展名保存

### 上下章导航

阅读页底部有「上一章」导航（`.reader-bottom-right a[title="上一章"]`），指向更早的章节。最新章节无此链接。

---

## 反爬情况

| 项目         | 情况                                                    |
| ------------ | ------------------------------------------------------- |
| TLS 指纹检测 | 无，Python urllib 直接 200                              |
| JS 质询      | 无，页面为纯服务端渲染                                  |
| Cloudflare   | 仅 beacon 统计脚本，无质询                              |
| 登录/Cookie  | 不需要                                                  |
| 防右键       | 阅读页 `oncontextmenu="return false;"`，不影响抓取      |
| 限速         | 未检测到明显限制，保守设为 1000ms / 请求                |

---

## 与 Webtoons 的关键差异

| 维度         | Webtoons                          | 动漫嗨                                    |
| ------------ | --------------------------------- | ----------------------------------------- |
| 资源标识     | titleNo（查询参数）               | comicId（URL 路径）                       |
| 语言         | zh-hant（繁体）                   | zh-cn（简体）                             |
| 章节列表     | 分页翻页、升序                    | 单页全量、降序（需反转）                  |
| 图片选择器   | `#_imageList img._images` data-url | `.lazyBox img.lazyload` data-original   |
| 图片 Referer | 需 webtoons.com                   | 不需要                                    |
| 评分         | 无                                | 有（8.0分）                               |
| 发现方式     | 遍历 genre 分类                   | 遍历全部分类分页                          |
| 搜索         | 无                                | `/search?title=`                          |

---

## 采集策略

1. **全站发现**：遍历 `/list/0-0-0-0/` 全部分页（约 42 页），逐页解析 `ul.mh-list` 卡片，入库 + 下载封面
2. **单本抓取**：访问详情页 `/manhua/{comicId}/`，解析元数据 + 全量章节列表（反转），逐章抓取阅读页图片
3. **增量更新**：图片下载前检查本地文件是否存在，已存在跳过；DB 记录按 orderIndex 增量更新
4. **任务管理**：复用通用 TaskService，支持停止/重试，重试时按 sourceSite 自动路由
