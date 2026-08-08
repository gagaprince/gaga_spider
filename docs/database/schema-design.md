# Gaga Spider - 数据库表结构设计

> 网络爬虫项目，抓取小说、漫画等多类型资源并保存到本地。

## 设计思路

核心原则：**类型无关主表 + 类型化子表 + JSON 扩展**。

- **资源主表不绑死类型** - `type` 字段区分小说/漫画/未来扩展类型，公共属性放主表
- **多来源支持** - 同一部作品可从多个站抓取，`resource_sources` 记录每个来源的 URL 和原始数据
- **内容双形态** - `chapters` 通用章节表 + `chapter_texts`(文本) / `chapter_images`(图片) 两个子表，小说走文本、漫画走图片
- **JSON 扩展字段** - 不同站点元数据差异大，用 `raw_data` / `config` JSON 字段兜底，避免频繁加列
- **任务调度可追踪** - `scrape_tasks` + `scrape_logs` 支持全量/增量抓取、失败重试、状态追踪

## ER 关系总览

```
source_sites  1──N  resource_sources  N──1  resources
                                                    │
                                          ┌─────────┼──────────┐
                                          │         │          │
                                    chapters    resource_    resource_
                                      │         authors     categories
                              ┌───────┴───────┐  │              │
                        chapter_texts  chapter_images          tags
                                                    │
                                              scrape_tasks ── scrape_logs
                                                    │
                                               files (本地文件)
```

## 表清单

| # | 表名 | 说明 |
|---|------|------|
| 1 | source_sites | 源站配置 |
| 2 | resources | 资源主表（小说/漫画） |
| 3 | resource_sources | 资源来源（多来源） |
| 4 | volumes | 卷/分卷 |
| 5 | chapters | 章节表（通用） |
| 6 | chapter_texts | 文本内容（小说） |
| 7 | chapter_images | 图片内容（漫画） |
| 8 | authors | 作者/画师 |
| 9 | resource_authors | 资源-作者关联 |
| 10 | categories | 分类 |
| 11 | resource_categories | 资源-分类关联 |
| 12 | tags | 标签 |
| 13 | resource_tags | 资源-标签关联 |
| 14 | scrape_tasks | 抓取任务 |
| 15 | scrape_logs | 抓取日志 |
| 16 | files | 本地文件记录 |

## 设计亮点

- **灵活扩展新类型** - 未来加"有声书"只需在 `type` ENUM 加值 + 新建 `chapter_audios` 子表，主表不动
- **多来源去重** - 同一作品多站抓取，`resources` 保持唯一，`resource_sources` 记录各来源，可选择最优来源下载
- **增量抓取** - `resource_sources.last_chapter_order` 记录断点，增量任务只抓新增章节
- **JSON 兜底** - `source_sites.config`、`resource_sources.raw_data`、`resources.extra` 三个 JSON 字段分别存抓取规则、原始快照、扩展元数据
- **文件去重** - `files.file_hash` 唯一约束，同一图片/封面不会重复存储
