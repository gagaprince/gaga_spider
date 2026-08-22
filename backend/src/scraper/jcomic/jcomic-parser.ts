import * as cheerio from 'cheerio';

export interface ComicCard {
  slug: string;
  title: string;
  coverUrl: string;
  updateDate: string;
  detailUrl: string;
  categories: string[];
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

export class JcomicParser {
  private safeDecode(value: string): string {
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('.list-content').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a[href^="/eps/"]').first();
      const href = $link.attr('href') || '';
      const slugMatch = href.match(/^\/eps\/(.+)$/);
      if (!slugMatch) return;

      const slug = this.safeDecode(slugMatch[1]);
      if (seen.has(slug)) return;
      seen.add(slug);

      const rawTitle = $el.find('.comic-title').first().text().trim();
      const title = rawTitle.replace(/\s*\(\d+\)\s*$/, '').trim();
      const coverUrl = $el.parent().find('> a img').first().attr('src') || '';
      const updateDate = ($el.find('.comic-date').text().trim() || '')
        .replace(/^最後更新:\s*/, '')
        .trim();
      const categories: string[] = [];

      $el.find('a[href^="/cat/"] button').each((__, button) => {
        const name = $(button).text().trim();
        if (name && !categories.includes(name)) categories.push(name);
      });

      cards.push({
        slug,
        title,
        coverUrl,
        updateDate,
        detailUrl: href.startsWith('http') ? href : `https://jcomic.net${href}`,
        categories,
      });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);
    const rawTitle = $('h1').first().text().trim();
    const title = rawTitle.replace(/\s*\(\d+\)\s*$/, '').trim();
    const coverUrl =
      $('.list-item img, .comic-thumb').first().attr('src') || '';

    const authors: string[] = [];
    $('a[href^="/author/"] button').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !authors.includes(name)) authors.push(name);
    });

    const genres: string[] = [];
    $('a[href^="/cat/"] button').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !genres.includes(name)) genres.push(name);
    });

    return {
      title,
      authors,
      genres,
      summary: '',
      coverUrl,
      status: 'unknown',
    };
  }

  parseChapterList(html: string, slug: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];
    const chapterPattern = new RegExp(`^/page/${this.escapeRegExp(slug)}/(\\d+)$`);

    $('a[href^="/page/"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = this.safeDecode(href).match(chapterPattern);
      if (!match) return;

      chapters.push({
        chapterId: match[1],
        title: $(el).text().trim() || `第${match[1]}話`,
        viewerUrl: href,
      });
    });

    chapters.sort(
      (a, b) => parseInt(a.chapterId, 10) - parseInt(b.chapterId, 10),
    );
    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('.jcomic-img').each((idx, el) => {
      const locked = ($(el).attr('data-locked') || '').trim();
      let imageUrl = ($(el).attr('src') || '').trim();

      if (locked) {
        try {
          const encoded = locked.replace(/^JCOMIC_TRAP_/, '').split('').reverse().join('');
          imageUrl = Buffer.from(encoded, 'base64').toString('utf8').trim();
        } catch {
          imageUrl = '';
        }
      }

      if (/^https?:\/\//.test(imageUrl)) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  parseLastPage(html: string): number {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('.pagination a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = this.safeDecode(href).match(/\/cat\/[^/]+\/(\d+)/);
      if (match) maxPage = Math.max(maxPage, parseInt(match[1], 10));
    });

    return maxPage;
  }

  private escapeRegExp(value: string): string {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }
}
