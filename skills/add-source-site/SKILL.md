---
name: add-source-site
description: Add a new comic/manga source site (scraper) to the Gaga Spider project. Use when the user wants to integrate a new 源站/source, build a new scraper service, register a new comic site, or extend the crawler with another domain. Covers site analysis, parser, scraper service, module/controller/task registration, frontend wiring, age rating (all/adult) and file-path isolation, and DB seeding.
metadata:
  short-description: Add a new comic source scraper
---

# Add Source Site (新增源站)

Gaga Spider uses a "base class + subclass" multi-source architecture. Adding a site means: analyze the site → write a parser → write a scraper service extending `BaseComicScraper` → register it in 4 backend files → wire the frontend "抓取目录" button.

Before starting, read `docs/ARCHITECTURE.md` section 9 (扩展指南) and the closest existing scraper (e.g. `backend/src/scraper/nniaooman/` for adult sites, `dongmanhi/` for all-ages).

## Step 1 — Analyze the site

Fetch and inspect (use `curl -sL -A "<chrome UA>"`):

1. **List page** — find: card container, detail link + stable ID, title, cover, pagination (last-page link format), total item count per page.
2. **Detail page** — find: title, cover, author(s), genre/category tags, status (ongoing/completed), summary, chapter list. Note whether chapters render server-side or need JS, and whether order is asc/desc.
3. **Viewer/reader page** — find how image URLs are exposed (`data-src`, JSON blob, etc.), CDN domains, and whether there is hotlink/Referer protection or TLS fingerprinting (if Node/axios is blocked, the Python `HttpClient`/`fetch.py` handles it).
4. Confirm the **content rating**: all-ages (`all`) or adult (`adult`).
5. Pick a **stable sourceId** (site-native ID or URL slug) and the **domain** used as the unique routing key.

Write the analysis to `docs/scraper/<site>-analysis.md` matching the format of the existing files.

## Step 2 — Create the parser

Create `backend/src/scraper/<site>/<site>-parser.ts` using cheerio. Implement the same interface as `dongmanhi-parser.ts`:

```ts
export interface ComicCard { comicId/slug; title; coverUrl; status?; detailUrl; }
export interface ComicDetail { title; authors: string[]; genres: string[]; summary; coverUrl; status; rating?; chapterCount?; }
export interface ChapterItem { chapterId; title; viewerUrl; }
export interface ViewerImage { orderIndex; imageUrl; }
```

Methods: `parseComicCards`, `parseDetail`, `parseChapterList` (reverse to ascending if HTML is descending), `parseViewerImages`, and `parseLastPage`/`parsePagination` for discovery.

## Step 3 — Create the scraper service

Create `backend/src/scraper/<site>/<site>-scraper.service.ts` extending `BaseComicScraper`. Use the nniaooman service as the template. Required pieces:

- `protected readonly logger`, `private readonly parser`
- `protected get baseUrl()`, `protected get rateLimitMs()` (typically 1000)
- **Age rating** — for adult sites override:
  ```ts
  protected get ageRating(): AgeRating { return AgeRating.ADULT; }
  ```
  `resourceSubDir` is derived automatically (`'18'` for adult), so covers/images go to `resourceFiles/18/...`. Do not hardcode paths.
- Constructor with the exact 11 injected repos/services (copy from an existing scraper), pass them to `super(...)`, set `this.parser`.
- `ensureSourceSite(): Promise<SourceSite>` — **must be `public`** (the startup initializer calls it). Upsert by domain; set `name`, `domain`, `resourceType: SiteResourceType.COMIC`, `ageRating: this.ageRating`, `config`, `rateLimit`, `status: 1`.
- `scrapeByResourceIdAsync(resourceId, maxChapters)` — stop running tasks, load `ResourceSource`, create a task, kick off `scrapeOneWithTask`.
- `scrapeOneWithTask(taskId, sourceId, maxChapters)` — mark running, call `doScrape`, mark success/failed, honor cancellation.
- `private doScrape(...)` — fetch detail, `saveResource`, `saveResourceSource`, `saveAuthors`, loop `genres`→`saveCategory` (each genre → many-to-many), then loop chapters: `saveChapter` + `scrapeChapterImages`.
- `discoverCatalog(taskId?)` — paginate the list, dedupe by sourceId, call `processCard` for each, return `{ discovered, new }`.
- Private helpers: `processCard`, `saveResource` (set `ageRating: this.ageRating` and `category: genres[0] || null`), `saveResourceSource`, `saveChapter`, `scrapeChapterImages`, `buildViewerUrl` if needed.

Use inherited helpers: `this.fetchPage`, `this.downloadCover(sourceId, url, genre)`, `this.computeImagePath`, `this.downloadChapterImage`, `this.saveAuthors`, `this.saveCategory`, `this.coverFileExists`, `this.checkCancelled`, `this.sleep`.

**Critical:** every `resourceRepo.create({...})` must include `ageRating: this.ageRating`. The first genre is also stored in the legacy `category` column, but many-to-many via `saveCategory` is what powers multi-category filtering.

## Step 4 — Register (4 files)

1. `backend/src/scraper/scraper.module.ts`: import, add to `providers` AND `exports`.
2. `backend/src/scraper/scraper.controller.ts`: inject the service; add `@Post('<site>/discover')`; add a branch in `resolveScraperByDomain` mapping the domain → the service.
3. `backend/src/scraper/scraper-initializer.service.ts`: inject + add to the `scrapers` array so the source-site row is seeded on startup (no manual DB insert needed).
4. `backend/src/task/task.controller.ts`: import, `@Inject(forwardRef(...))`, add an `instanceof` branch in `retry`, and a domain branch in `resolveScraperByTask`.

If the site needs a single-title scrape endpoint beyond `scrape-resource`, add it to the controller (like webtoons' `/webtoons/scrape`); discovery alone is usually enough.

## Step 5 — Frontend

1. `frontend/src/api/client.ts`: add `discover<Site>(): POST /scraper/<site>/discover`.
2. `frontend/src/components/BookshelfPage.tsx`: in `handleDiscover`, add a branch mapping the site's domain → the new `api.discover<Site>()`. (The source-site and category dropdowns are dynamic via `ageRating`, so nothing else is needed.)

Mobile `mobile/` is read-only (no discover controls) — no changes required.

## Step 6 — Validate

- `npx tsc --noEmit -p backend/tsconfig.json`, then frontend and mobile.
- Restart backend; confirm the log line `源站已就绪: <name> (<domain>, <ageRating>)` and that `SELECT * FROM source_sites` shows the row.
- Toggle the matching age-rating mode in Settings (PC) or the 🔞 button (mobile); confirm the site appears in both the filter dropdown and the "抓取目录" dropdown.
- Run discovery on one page first if possible; verify covers land in `resourceFiles/[18/]covers/...` and images in `[18/]images/<sourceId>/...`.
- For adult sites verify files are under `resourceFiles/18/`, never the all-ages tree.

## Gotchas

- `domain` is the unique routing key — keep it identical across `ensureSourceSite`, both controllers, and the frontend mapping.
- Chapter order: HTML is almost always newest-first; `reverse()` before assigning `orderIndex` from 1.
- Images with lazy loading use `data-src`/`data-original`, not `src`.
- Do not add DB columns for a new site; `extra` JSON and the existing many-to-many tables cover site-specific metadata.
- `ensureSourceSite` must stay `public` (it is declared `abstract` on the base and called by `ScraperInitializer`).
- Never hardcode `resourceFiles` subpaths; always go through `resourceSubDir`/inherited path helpers.
