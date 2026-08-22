import * as cheerio from 'cheerio';

export interface ComicCard {
  bookId: string;
  title: string;
  coverUrl: string;
  updateDate: string;
  detailUrl: string;
}

export interface ComicDetail {
  title: string;
  authors: string[];
  genres: string[];
  broadCategory: string;
  summary: string;
  coverUrl: string;
  status: string;
}

export interface ChapterItem {
  chapterId: string;
  title: string;
  viewerUrl: string;
}

export interface ViewerImage {
  orderIndex: number;
  imageUrl: string;
}

export class Rman8Parser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('li.hl-list-item').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a.hl-item-thumb[href]').first();
      const href = $link.attr('href') || '';
      const match = href.match(/\/readbooks\/(\d+)\.html/);
      if (!match) return;

      const bookId = match[1];
      if (seen.has(bookId)) return;
      seen.add(bookId);

      const title = ($link.attr('title') || '').trim();
      const coverUrl = ($link.attr('data-original') || '').trim();
      const updateDate = $el.find('.hl-item-sub').first().text().trim();
      const detailUrl = href.startsWith('http')
        ? href
        : `https://rman8.com${href}`;

      if (!title) return;

      cards.push({ bookId, title, coverUrl, updateDate, detailUrl });
    });

    return cards;
  }

  parseLastPage(html: string): number {
    const $ = cheerio.load(html);
    let maxPage = 1;

    const totalText = $('.hl-page-total').first().text();
    const totalMatch = totalText.match(/\/\s*(\d+)\s*页/);
    if (totalMatch) {
      maxPage = parseInt(totalMatch[1], 10);
    }

    $('a[href*="/page/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/page\/(\d+)/);
      if (match) maxPage = Math.max(maxPage, parseInt(match[1], 10));
    });

    return maxPage;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('h1.hl-dc-title').first().text().trim();
    const coverUrl = (
      $('.hl-dc-pic .hl-item-thumb[data-original]')
        .first()
        .attr('data-original') || ''
    ).trim();

    const infoList = $('.hl-vod-data .hl-full-box > ul > li');
    let status = 'unknown';
    let summary = '';
    const authors: string[] = [];
    const genres: string[] = [];
    let broadCategory = '';

    infoList.each((_, el) => {
      const $li = $(el);
      const label = $li.find('em.hl-text-muted').first().text().trim();

      if (label.startsWith('状态')) {
        const raw = $li.find('span.hl-text-conch').first().text().trim();
        if (/连载中/.test(raw)) status = 'ongoing';
        else if (/已完结/.test(raw)) status = 'completed';
        return;
      }

      if (label.startsWith('作者')) {
        $li.find('a').each((__, a) => {
          const name = $(a).text().trim();
          if (name && !authors.includes(name)) authors.push(name);
        });
        return;
      }

      if (label.startsWith('TAG')) {
        $li.find('a').each((__, a) => {
          const $a = $(a);
          const href = $a.attr('href') || '';
          const name = $a.text().trim();
          if (!name) return;
          if (/^\/searchbook\//.test(href)) {
            if (!genres.includes(name)) genres.push(name);
          } else if (/^\/bookcatalog\//.test(href) && !broadCategory) {
            broadCategory = name;
          }
        });
        return;
      }

      if ($li.hasClass('blurb') || label.startsWith('简介')) {
        const clone = $li.clone();
        clone.find('em').remove();
        summary = clone.text().trim();
      }
    });

    return {
      title,
      authors,
      genres,
      broadCategory,
      summary,
      coverUrl,
      status,
    };
  }

  parseChapterList(html: string, bookTitle: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];
    const seen = new Set<string>();

    const prefix = bookTitle ? `${bookTitle}-` : '';

    $('a.module-play-list-link[href]').each((_, el) => {
      const $a = $(el);
      const href = $a.attr('href') || '';
      const match = href.match(/\/readbooks\/\d+\/([A-Za-z0-9]+)\.html/);
      if (!match) return;

      const chapterId = match[1];
      if (seen.has(chapterId)) return;
      seen.add(chapterId);

      let title = ($a.attr('title') || $a.text() || '').trim();
      if (prefix && title.startsWith(prefix)) {
        title = title.slice(prefix.length).trim();
      }

      const viewerUrl = href.startsWith('http')
        ? href
        : `https://rman8.com${href}`;

      chapters.push({
        chapterId,
        title: title || `第${chapters.length + 1}话`,
        viewerUrl,
      });
    });

    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('img[data-src][data-index]').each((_, el) => {
      const $img = $(el);
      const imageUrl = ($img.attr('data-src') || '').trim();
      const indexRaw = $img.attr('data-index');
      const orderIndex = indexRaw
        ? parseInt(indexRaw, 10) + 1
        : images.length + 1;

      if (/^https?:\/\//.test(imageUrl)) {
        images.push({ orderIndex, imageUrl });
      }
    });

    images.sort((a, b) => a.orderIndex - b.orderIndex);
    return images.map((image, idx) => ({ ...image, orderIndex: idx + 1 }));
  }
}
