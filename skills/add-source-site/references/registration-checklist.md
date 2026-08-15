# Registration Checklist (exact touch points)

Replace `<site>` with the folder/key (e.g. `nniaooman`), `<Svc>` with the service class, `<domain>` with the site domain, and `<Name>` with the Chinese display name.

## backend/src/scraper/scraper.module.ts
```ts
import { <Svc> } from './<site>/<site>-scraper.service';
// providers[] AND exports[]:
<Svc>,
```

## backend/src/scraper/scraper.controller.ts
```ts
import { <Svc> } from './<site>/<site>-scraper.service';
// constructor:
private readonly <site>Scraper: <Svc>,
// route:
@Post('<site>/discover')
async discover<Site>() {
  const result = await this.<site>Scraper.discoverCatalog();
  return { success: true, data: result };
}
// in resolveScraperByDomain:
if (domain === '<domain>') return this.<site>Scraper;
```

## backend/src/scraper/scraper-initializer.service.ts
```ts
import { <Svc> } from './<site>/<site>-scraper.service';
// constructor + scrapers[]:
{ name: '<Name>', instance: this.<site>Scraper },
```

## backend/src/task/task.controller.ts
```ts
import { <Svc> } from '../scraper/<site>/<site>-scraper.service';
// constructor:
@Inject(forwardRef(() => <Svc>)) private readonly <site>Scraper: <Svc>,
// in retry() add an instanceof branch (config shape must match doScrape):
} else if (scraper instanceof <Svc>) {
  const config = (newTask.config ?? {}) as { slug?: string; maxChapters?: number };
  this.<site>Scraper.scrapeOneWithTask(newTask.id, config.slug ?? '', config.maxChapters ?? 0).catch(() => {});
}
// in resolveScraperByTask:
if (domain === '<domain>') return this.<site>Scraper;
```

## frontend/src/api/client.ts
```ts
discover<Site>: () =>
  request<{ success: boolean; data: { discovered: number; new: number } }>(
    '/scraper/<site>/discover', { method: 'POST' },
  ),
```

## frontend/src/components/BookshelfPage.tsx (handleDiscover)
```ts
: discoverDomain === '<domain>'
  ? await api.discover<Site>()
  : await api.discoverManhuazhan(); // keep existing fallback
```

## Constructor signature (must match BaseComicScraper super call)
```
sourceSiteRepo, resourceRepo, resourceSourceRepo, chapterRepo,
chapterImageRepo, authorRepo, resourceAuthorRepo, categoryRepo,
resourceCategoryRepo, taskService, settingsService
```
