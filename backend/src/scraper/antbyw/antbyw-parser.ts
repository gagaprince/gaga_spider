import * as cheerio from 'cheerio';

export interface ComicCard {
  kuid: string;
  title: string;
  coverUrl: string;
  detailUrl: string;
}

export interface ComicDetail {
  title: string;
  authors: string[];
  genres: string[];
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

export class AntbywParser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('div.uk-card.mbm.uk-text-center').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a[href*="a=bofang"]').first();
      const href = $link.attr('href') || '';
      const m = href.match(/[?&]kuid=(\d+)/);
      if (!m) return;
      const kuid = m[1];
      if (seen.has(kuid)) return;
      seen.add(kuid);

      const title =
        $el.find('p a[href*="a=bofang"]').first().text().trim() ||
        $link.text().trim();
      const coverUrl = $el.find('div.uk-card-media-top img').attr('src') || '';
      const detailUrl = href.startsWith('http')
        ? href.replace(/&amp;/g, '&')
        : `https://www.antbyw.com/${href.replace(/^\.\//, '').replace(/&amp;/g, '&')}`;

      cards.push({ kuid, title, coverUrl, detailUrl });
    });

    return cards;
  }

  parseLastPage(html: string): number {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('div.pg a, .pg a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const m = href.match(/[?&]page=(\d+)/);
      if (m) {
        const page = parseInt(m[1], 10);
        if (page > maxPage) maxPage = page;
      }
    });

    if (maxPage === 1) {
      const txt = $('div.pg').last().text();
      const m = txt.match(/\/\s*(\d+)\s*页/);
      if (m) maxPage = parseInt(m[1], 10);
    }

    return maxPage;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('h3.uk-heading-line').first().text().trim();
    const coverUrl =
      $('div.bofangwrap div.uk-width-medium img').first().attr('src') || '';

    const authors: string[] = [];
    $('div.cl.uk-text-small').each((_, el) => {
      const label = $(el).text();
      if (label.includes('漫畫作者') || label.includes('漫画作者')) {
        $(el)
          .find('a')
          .each((__, a) => {
            const name = $(a).text().trim();
            if (name) authors.push(name);
          });
        if (authors.length === 0) {
          const name = label
            .replace(/.*?漫[画畫]作者[:：]?/, '')
            .replace(/\s+/g, ' ')
            .trim();
          if (name) authors.push(name);
        }
      }
    });

    const genres: string[] = [];
    $('div.cl.xs1 a.uk-label[href*="category_id"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name) genres.push(name);
    });

    let status = 'unknown';
    $('div.cl.xs1 a.uk-label').each((_, el) => {
      const t = $(el).text();
      if (t.includes('已完结') || t.includes('完結')) status = 'completed';
      else if (t.includes('连载') || t.includes('連載')) status = 'ongoing';
    });

    return { title, authors, genres, summary: '', coverUrl, status };
  }

  parseChapterList(html: string, kuid: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('div.muludiv a.zj-container[href*="a=read"]').each((_, el) => {
      const $el = $(el);
      const href = ($el.attr('href') || '').replace(/&amp;/g, '&');
      const m = href.match(/[?&]zjid=(\d+)/);
      if (!m) return;
      const title = $el.text().trim();
      const viewerUrl = href.startsWith('http')
        ? href
        : `https://www.antbyw.com/${href.replace(/^\.\//, '')}`;
      chapters.push({ chapterId: m[1], title, viewerUrl });
    });

    chapters.reverse();
    return chapters;
  }

  parseReaderTotalPages(html: string): number {
    const m = html.match(/\/\s*(\d+)\s*页/);
    if (m) return parseInt(m[1], 10);
    const m2 = html.match(/[?&]page=(\d+)[^0-9]/g);
    if (m2) {
      const pages = m2.map((s) => parseInt(s.match(/(\d+)/)![1], 10));
      return Math.max(...pages);
    }
    return 1;
  }

  parseViewerImageUrls(html: string): string[] {
    const m = html.match(/let\s+urls\s*=\s*(\[[\s\S]*?\]);/);
    if (!m) return [];
    try {
      const arr = JSON.parse(m[1]);
      if (Array.isArray(arr)) return arr.map((u) => String(u));
    } catch {
      const urls = m[1].match(/https?:\/\/[^"'\s,]+/g);
      if (urls) return urls;
    }
    return [];
  }
}
