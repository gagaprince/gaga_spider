# 内容分级功能（Age Rating）

> 本文档记录 Gaga Spider 的内容分级机制：如何区分全年龄段与成人限定内容，
> 以及前后端如何协同实现分级筛选。

---

## 1. 设计目标

- 系统中所有资源（漫画/小说）和源站都带有分级标记：`all`（全年龄段）或 `adult`（成人限定）
- 前端**默认只展示全年龄段内容**，包括书籍列表、分类筛选项、源站筛选项、目录抓取源站列表
- 用户在设置页主动开启「成人限定模式」后，整个书架切换为只展示成人内容
- 分级设置保存在浏览器 `localStorage`，切换后所有页面实时响应，刷新后保持
- 新增源站时只需在 scraper 中声明一次分级，源站记录和抓取入库的资源会自动继承

---

## 2. 数据库

### 2.1 涉及表与字段

| 表 | 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|---|
| `resources` | `age_rating` | `ENUM('all','adult')` | `'all'` | 资源分级 |
| `source_sites` | `age_rating` | `ENUM('all','adult')` | `'all'` | 源站分级 |

`resources.age_rating` 上建有索引 `idx_age_rating`，用于高频过滤。

### 2.2 字段位置

- `source_sites.age_rating`：位于 `status` 之后
- `resources.age_rating`：位于 `category` 之后、`pdf_path` 之前

### 2.3 迁移脚本

首次引入分级功能的迁移脚本为 `docs/database/migration_add_age_rating.sql`，内容：

```sql
ALTER TABLE resources
  ADD COLUMN age_rating ENUM('all','adult') NOT NULL DEFAULT 'all'
  COMMENT '内容分级: all=全年龄段, adult=成人限定'
  AFTER category,
  ADD INDEX idx_age_rating (age_rating);

ALTER TABLE source_sites
  ADD COLUMN age_rating ENUM('all','adult') NOT NULL DEFAULT 'all'
  COMMENT '内容分级: all=全年龄段, adult=成人限定'
  AFTER status;
```

> 存量数据全部默认为 `'all'`，无需额外 UPDATE。

### 2.4 手工标记分级

将某本书标记为成人限定：

```sql
UPDATE resources SET age_rating = 'adult' WHERE id = 123;
```

将某个源站标记为成人限定（会影响后续新抓取的资源，见第 4 节）：

```sql
UPDATE source_sites SET age_rating = 'adult' WHERE id = 4;
```

批量将某个源站下所有资源标记为成人限定：

```sql
UPDATE resources r
JOIN resource_sources rs ON rs.resource_id = r.id
SET r.age_rating = 'adult'
WHERE rs.source_site_id = 4;
```

---

## 3. 后端

### 3.1 枚举定义

`backend/src/constants/age-rating.ts`：

```typescript
export enum AgeRating {
  ALL = 'all',
  ADULT = 'adult',
}
```

### 3.2 实体

- `Resource` 实体（`backend/src/entities/resource.entity.ts`）新增 `ageRating` 列，默认 `AgeRating.ALL`
- `SourceSite` 实体（`backend/src/entities/source-site.entity.ts`）新增 `ageRating` 列，默认 `AgeRating.ALL`

### 3.3 API 接口

所有资源查询接口均支持 `ageRating` 查询参数，**默认值为 `all`**：

| 接口 | 参数 | 说明 |
|---|---|---|
| `GET /api/resources` | `ageRating=all\|adult` | 按分级筛选资源列表 |
| `GET /api/resources/categories/list` | `ageRating=all\|adult` | 只返回该分级下有资源的分类及数量 |
| `GET /api/resources/source-sites/list` | `ageRating=all\|adult` | 返回该分级下状态为启用的源站 |

资源详情接口 `GET /api/resources/:id` 不做分级过滤，直接按 ID 返回（便于通过链接直接访问）。

**响应示例**

```json
{
  "id": 1,
  "title": "惡魔女婿",
  "category": "動作",
  "ageRating": "all",
  "chapterCount": 143
}
```

源站列表响应：

```json
[
  { "id": 1, "name": "Webtoons", "domain": "www.webtoons.com" }
]
```

### 3.4 后端过滤逻辑

`ResourceService.findAll` 中，无论前端是否传参，都会追加分级条件：

```typescript
qb.andWhere('r.age_rating = :ageRating', { ageRating: ageRating ?? 'all' });
```

`listCategories` 和 `listSourceSites` 同理，确保分类/源站筛选项不会出现不属于当前分级的条目。

---

## 4. 抓取层：源站分级如何传递到资源

### 4.1 基类声明

`BaseComicScraper`（`backend/src/scraper/base-comic-scraper.ts`）提供可覆盖的 getter：

```typescript
protected get ageRating(): AgeRating {
  return AgeRating.ALL;
}
```

### 4.2 源站记录自动继承

每个 scraper 的 `ensureSourceSite()` 在创建 `source_sites` 记录时，会写入：

```typescript
site = this.sourceSiteRepo.create({
  name: 'xxx',
  domain: 'xxx',
  resourceType: SiteResourceType.COMIC,
  ageRating: this.ageRating,   // ← 自动写入
  // ...
});
```

### 4.3 抓取入库的资源自动继承

每个 scraper 的两处资源创建逻辑（目录发现 `saveResourceFromCard` 和全文抓取 `saveResource`）在 `resourceRepo.create()` 时都写入：

```typescript
resource = this.resourceRepo.create({
  type: ResourceType.COMIC,
  ageRating: this.ageRating,   // ← 自动写入
  title: '...',
  // ...
});
```

### 4.4 新增成人源站只需一行代码

新建 scraper service 时，覆盖 getter 即可：

```typescript
@Injectable()
export class XxxScraperService extends BaseComicScraper {
  protected get ageRating() { return AgeRating.ADULT; }
  // ...
}
```

源站记录、目录发现入库的书籍、全文抓取入库的书籍都会自动标记为 `adult`。

---

## 5. 前端

### 5.1 状态管理

PC 端和手机端各自维护一个 `useAgeRating` hook：

- PC：`frontend/src/hooks/useAgeRating.ts`
- 手机：`mobile/src/hooks/useAgeRating.ts`

实现机制：
- 值存储在 `localStorage` 的 `age-rating` 键
- 通过 `CustomEvent('age-rating-change')` + `storage` 事件实现跨组件、跨标签页实时同步
- 默认值为 `'all'`

```typescript
const [ageRating, setAgeRating] = useAgeRating();
// ageRating: 'all' | 'adult'
// setAgeRating('adult')  // 切换并广播
```

### 5.2 设置页开关

PC 端 `SettingsPage`（`frontend/src/components/SettingsPage.tsx`）新增「内容分级」卡片：

- Switch 开关：全年龄段模式（👪）/ 成人限定模式（🔞）
- 切换后立即写入 `localStorage` 并广播，书架页无需刷新即可响应

> 手机端目前为纯浏览端，没有设置页。如需切换，可通过 PC 端设置后，同一浏览器的手机端页面也会响应（同源 `localStorage`）。

### 5.3 书架页联动

`BookshelfPage` 中所有数据请求都携带当前分级：

| 数据 | 调用 | 分级联动 |
|---|---|---|
| 书籍列表 | `api.getResources({ ageRating })` | 只返回该分级书籍 |
| 分类下拉 | `api.getCategories(ageRating)` | 只显示该分级下有书的分类 |
| 源站筛选下拉 | `api.getSourceSites(ageRating)` | 只显示该分级的启用源站 |
| 目录抓取源站下拉 | 同上 | 只显示该分级的源站；无可用源站时按钮置灰 |
| URL 中的 `sourceSite` 参数 | 自动清理 | 若选中的源站不属于当前分级，自动清空筛选 |

### 5.4 手机端联动

`SearchPage` 同样在请求书籍列表和分类时携带 `ageRating`，切换分级后自动重新加载。

### 5.5 API Client

PC 和手机端的 `api/client.ts`：
- `Resource` 接口新增 `ageRating: string` 字段
- `getResources` 参数新增 `ageRating`
- `getCategories(ageRating?)` 支持分级参数
- PC 端新增 `getSourceSites(ageRating?)` 方法

---

## 6. 当前数据状态

截至功能上线时：

| 数据 | 分级 |
|---|---|
| 3 个源站（Webtoons、动漫嗨、漫画栈） | 全部为 `all` |
| 全部存量资源（约 39,000+ 条） | 全部为 `all` |

因此在设置页开启成人限定模式后，书架、分类、源站筛选项均为空（无成人数据），这是预期行为。

---

## 7. 扩展检查清单

新增一个成人源站时需确认：

- [ ] scraper service 覆盖 `protected get ageRating() { return AgeRating.ADULT; }`
- [ ] 执行一次目录发现，让源站记录和书籍以 `adult` 分级入库
- [ ] 前端设置页打开成人限定模式，确认源站、分类、书籍正常显示

将一批已有全年龄数据标记为成人内容时：

- [ ] 执行第 2.4 节的 UPDATE SQL
- [ ] 如该数据所属源站本身是成人站，同时更新 `source_sites.age_rating`
