# Gaga Spider API 接口文档

> 基础地址: `http://localhost:3000/api`
> 所有接口均返回 JSON 格式数据

---

## 1. 资源管理 (Resources)

### 1.1 获取资源列表

```
GET /resources
```

**Query 参数**

| 参数          | 类型   | 必填 | 说明                                           |
| ------------- | ------ | ---- | ---------------------------------------------- |
| type          | string | 否   | 资源类型,如 `comic`                            |
| keyword       | string | 否   | 标题关键词,模糊匹配                           |
| scrapeStatus  | string | 否   | 抓取状态筛选: `scraped` / `not_scraped`        |
| category      | string | 否   | 分类名称,如 `動作` / `戀愛`                    |
| page          | number | 否   | 页码,默认 `1`                                  |
| pageSize      | number | 否   | 每页条数,默认 `20`                             |

**响应示例**

```json
{
  "items": [
    {
      "id": 1,
      "type": "comic",
      "title": "惡魔女婿",
      "summary": null,
      "coverUrl": "https://...",
      "localCoverPath": "/resourceFiles/covers/動作/7709.jpg",
      "status": "ongoing",
      "language": "zh-hant",
      "rating": null,
      "chapterCount": 143,
      "isComplete": 0,
      "category": "動作",
      "extra": { "likeCount": "12.3万", "genre": "action" },
      "createdAt": "2025-01-01T00:00:00Z",
      "updatedAt": "2025-01-02T00:00:00Z"
    }
  ],
  "total": 500,
  "page": 1,
  "pageSize": 20
}
```

---

### 1.2 获取资源详情

```
GET /resources/:id
```

**Path 参数**

| 参数 | 类型   | 必填 | 说明     |
| ---- | ------ | ---- | -------- |
| id   | number | 是   | 资源 ID  |

**响应示例**

```json
{
  "id": 1,
  "type": "comic",
  "title": "惡魔女婿",
  "summary": null,
  "coverUrl": "https://...",
  "localCoverPath": "/resourceFiles/covers/動作/7709.jpg",
  "status": "ongoing",
  "language": "zh-hant",
  "rating": null,
  "chapterCount": 143,
  "isComplete": 0,
  "category": "動作",
  "extra": {},
  "sources": [
    {
      "id": 1,
      "resourceId": 1,
      "sourceSiteId": 1,
      "sourceUrl": "https://www.webtoons.com/...",
      "sourceId": "7709",
      "rawTitle": "惡魔女婿",
      "scrapeStatus": "idle"
    }
  ],
  "chapters": [
    {
      "id": 6,
      "orderIndex": 1,
      "title": "第1話",
      "chapterType": "image",
      "pageCount": 80,
      "isDownloaded": 1,
      "downloadedAt": "2025-01-02T00:00:00Z",
      "sourceUrl": "https://www.webtoons.com/..."
    }
  ],
  "authors": [
    { "id": 1, "name": "作者名", "type": "author" }
  ],
  "categories": [
    { "id": 1, "name": "動作", "resourceType": "comic" }
  ]
}
```

---

### 1.3 获取分类列表

```
GET /resources/categories/list
```

**响应示例**

```json
[
  { "name": "動作", "count": 45 },
  { "name": "戀愛", "count": 38 }
]
```

---

### 1.4 获取章节图片

```
GET /resources/chapters/:chapterId/images
```

**Path 参数**

| 参数      | 类型   | 必填 | 说明     |
| --------- | ------ | ---- | -------- |
| chapterId | number | 是   | 章节 ID  |

**响应示例**

```json
{
  "id": 6,
  "resourceId": 1,
  "orderIndex": 1,
  "title": "第1話",
  "pageCount": 80,
  "isDownloaded": 1,
  "images": [
    {
      "id": 1,
      "orderIndex": 1,
      "sourceUrl": "https://...",
      "localPath": "/resourceFiles/images/7709/1/0001.jpg",
      "status": "downloaded"
    }
  ],
  "prevChapter": { "id": 5, "orderIndex": 0, "title": "序章" },
  "nextChapter": { "id": 7, "orderIndex": 2, "title": "第2話" }
}
```

> `prevChapter` / `nextChapter` 为 `null` 时表示已是首章/末章

---

## 2. 抓取控制 (Scraper)

### 2.1 抓取目录

抓取所有分类下的漫画作品列表,保存封面到本地。

```
POST /scraper/webtoons/discover
```

**请求体**: 无

**响应示例**

```json
{
  "success": true,
  "data": { "discovered": 500, "new": 12 }
}
```

---

### 2.2 按 titleNo 抓取

按 Webtoons 原始编号发起抓取,会先停止同 titleNo 的运行中任务。同步等待返回。

```
POST /scraper/webtoons/scrape
```

**请求体**

| 参数        | 类型   | 必填 | 说明                         |
| ----------- | ------ | ---- | ---------------------------- |
| titleNo     | number | 是   | Webtoons 作品编号            |
| maxChapters | number | 否   | 最多抓取章节数,`0` 为全部    |

**响应示例**

```json
{
  "success": true,
  "data": {
    "resource": { "id": 1, "title": "惡魔女婿" },
    "chapters": [
      { "id": 6, "title": "第1話", "imageCount": 80 }
    ]
  }
}
```

---

### 2.3 按资源 ID 异步抓取

按本地资源 ID 发起异步抓取,立即返回任务 ID,后台执行。会先停止同资源的运行中任务。

```
POST /scraper/webtoons/scrape-resource
```

**请求体**

| 参数        | 类型   | 必填 | 说明                         |
| ----------- | ------ | ---- | ---------------------------- |
| resourceId  | number | 是   | 本地资源 ID                  |
| maxChapters | number | 否   | 最多抓取章节数,`0` 为全部    |

**响应示例**

```json
{
  "success": true,
  "data": { "taskId": 14 }
}
```

---

### 2.4 按资源 ID 异步抓取 (通用)

根据资源关联的来源站点自动路由到对应源站的 scraper（Webtoons / 动漫嗨），无需指定源站。会先停止同资源的运行中任务。

```
POST /scraper/scrape-resource
```

**请求体**

| 参数        | 类型   | 必填 | 说明                         |
| ----------- | ------ | ---- | ---------------------------- |
| resourceId  | number | 是   | 本地资源 ID                  |
| maxChapters | number | 否   | 最多抓取章节数,`0` 为全部    |

**响应示例**

```json
{
  "success": true,
  "data": { "taskId": 14 }
}
```

> 路由逻辑: 查询 `resource_sources` 表中该 resourceId 关联的 `source_sites.domain`，`www.webtoons.com` 走 Webtoons scraper，`www.dongmanhi.com` 走动漫嗨 scraper。

---

### 2.5 动漫嗨目录发现

抓取动漫嗨全部分类下的漫画作品列表,保存封面到本地。

```
POST /scraper/dongmanhi/discover
```

**请求体**: 无

**响应示例**

```json
{
  "success": true,
  "data": { "discovered": 1008, "new": 50 }
}
```

> 遍历 `/list/0-0-0-0/` 全部分页（每页 24 部），逐页抓取漫画卡片入库。

---

### 2.6 按 titleNo 抓取 (GET)

与 2.2 功能相同,通过 GET 方式调用,便于浏览器直接触发。

```
GET /scraper/webtoons/scrape?titleNo=7709&maxChapters=1
```

**Query 参数**

| 参数        | 类型   | 必填 | 说明                         |
| ----------- | ------ | ---- | ---------------------------- |
| titleNo     | string | 是   | Webtoons 作品编号            |
| maxChapters | string | 否   | 最多抓取章节数,`0` 为全部    |

**响应**: 同 2.2

---

## 3. 任务管理 (Tasks)

### 3.1 获取任务列表

```
GET /tasks
```

**Query 参数**

| 参数     | 类型   | 必填 | 说明                              |
| -------- | ------ | ---- | --------------------------------- |
| status   | string | 否   | 任务状态: `pending` / `running` / `success` / `failed` / `cancelled` |
| page     | string | 否   | 页码,默认 `1`                     |
| pageSize | string | 否   | 每页条数,默认 `20`                |

**响应示例**

```json
{
  "items": [
    {
      "id": 14,
      "status": "running",
      "taskType": "full",
      "priority": 0,
      "totalItems": 143,
      "doneItems": 5,
      "errorMessage": null,
      "scheduledAt": "2025-01-01T00:00:00Z",
      "startedAt": "2025-01-01T00:00:01Z",
      "finishedAt": null,
      "createdAt": "2025-01-01T00:00:00Z",
      "resource": { "id": 1, "title": "惡魔女婿" },
      "sourceSite": { "id": 1, "name": "Webtoons" }
    }
  ],
  "total": 30,
  "page": 1,
  "pageSize": 20
}
```

---

### 3.2 获取任务详情

```
GET /tasks/:id
```

**响应**: 同 3.1 中单个任务对象

---

### 3.3 停止任务

标记任务为取消状态,抓取进程会在下一个检查点停止。

```
POST /tasks/:id/stop
```

**响应示例**

```json
{ "success": true, "message": "任务已标记停止" }
```

---

### 3.4 重试任务

基于已有任务配置创建新任务并立即执行,会先停止同资源的运行中任务。

```
POST /tasks/:id/retry
```

**响应示例**

```json
{
  "success": true,
  "data": {
    "id": 15,
    "status": "pending",
    "taskType": "full",
    "config": { "titleNo": 7709, "maxChapters": 0 },
    "resourceId": 1,
    "sourceSiteId": 1
  }
}
```

---

### 3.5 删除任务

删除任务及其关联日志。

```
DELETE /tasks/:id
```

**响应示例**

```json
{ "success": true, "message": "任务已删除" }
```

---

## 4. 系统设置 (Settings)

### 4.1 获取设置

```
GET /settings
```

**响应示例**

```json
{
  "resourcePath": "/Users/gagaprince/aiwork/gaga_spider/resourceFiles"
}
```

---

### 4.2 更新设置

```
PUT /settings
```

**请求体**

| 参数        | 类型   | 必填 | 说明                       |
| ----------- | ------ | ---- | -------------------------- |
| resourcePath | string | 否   | 本地资源文件存储根目录     |

**响应示例**

```json
{
  "resourcePath": "/Users/gagaprince/aiwork/gaga_spider/resourceFiles"
}
```

---

## 5. 静态资源

下载到本地的封面和章节图片通过静态文件服务提供访问,不加 `/api` 前缀。

| 资源类型 | URL 格式                                           | 示例                                                        |
| ------- | -------------------------------------------------- | ----------------------------------------------------------- |
| 封面    | `/resourceFiles/covers/{分类}/{titleNo}.{ext}`     | `/resourceFiles/covers/動作/7709.jpg`                       |
| 章节图  | `/resourceFiles/images/{titleNo}/{episodeNo}/{序号}.{ext}` | `/resourceFiles/images/7709/1/0001.jpg`                     |

---

## 任务状态流转

```
pending → running → success
                   ↘ failed
                   ↘ cancelled (用户停止 / 被新任务替代)
```

- `pending`: 已创建,等待执行
- `running`: 正在抓取中
- `success`: 抓取完成
- `failed`: 抓取失败,`errorMessage` 字段记录原因
- `cancelled`: 被用户停止或被同资源的新任务替代
