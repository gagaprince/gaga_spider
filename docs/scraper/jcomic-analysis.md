# JComic (jcomic.net) 抓取分析

## 站点信息

- 域名：`https://jcomic.net`
- 类型：成人漫画/WEBTOON
- 年龄分级：`adult`
- 本次只发现四个分类：`WEBTOON`、`人妻`、`NTR`、`強暴`
- 图片服务：`https://images.jcomic.net`，URL 为带签名的临时地址

## 页面结构

### 分类列表页

- URL：`https://jcomic.net/cat/WEBTOON`
- 分页：`https://jcomic.net/cat/WEBTOON/2`
- 分页选择器：`.pagination a[href*="/cat/"]`
- 卡片：`.list-content`，封面在同级前置 `<a><img></a>` 中
- 字段：
  - 作品链接：`a[href^="/eps/"]`
  - 标题：`.comic-title`，末尾括号中的数字为站点统计数，需要去掉
  - 作者：`a[href^="/author/"] button`
  - 分类：`a[href^="/cat/"] button`
  - 更新时间：`.comic-date`
  - 封面：`> a img.comic-thumb`

### 详情页

- URL：`https://jcomic.net/eps/{slug}`
- 标题：`h1`
- 作者：`a[href^="/author/"] button`
- 分类：`a[href^="/cat/"] button`
- 章节：`a[href^="/page/"]`，只保存形如 `/page/{slug}/{chapterNo}` 的链接
- 该站点详情页不提供简介和完结状态，统一保存为空简介和 `unknown`

### 阅读页

- URL：`https://jcomic.net/page/{slug}/{chapterNo}`
- 图片：`.jcomic-img`
- 真实图片地址在 `data-locked` 中，解码步骤：
  1. 删除前缀 `JCOMIC_TRAP_`
  2. 反转字符串
  3. Base64 解码得到图片 URL
- 签名 URL 有效期较短，抓取到阅读页后应立即下载图片

## 实现策略

1. `discoverCatalog` 顺序遍历四个指定分类，不抓取其他分类页。
2. 列表阶段创建 `resources`、`resource_sources`、封面和指定分类关联。
3. 单本抓取时访问 `/eps/{slug}`，补全作者、分类、章节元数据。
4. 章节图片下载到成人资源目录 `18/images/{slug}/{chapterOrder}/`。
5. 源站记录写入 `source_sites`，域名为 `jcomic.net`，年龄分级为 `adult`。

## 实现文件

- `backend/src/scraper/jcomic/jcomic-parser.ts`
- `backend/src/scraper/jcomic/jcomic-scraper.service.ts`
