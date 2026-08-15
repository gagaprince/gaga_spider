import * as cheerio from 'cheerio';

export interface ComicCard {
  slug: string;
  title: string;
  coverUrl: string;
  updateDate: string;
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

export class Manhwa18Parser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('.manga-item').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('.thumb > a[href^="/webtoon/"]').first();
      const href = $link.attr('href') || '';
      const slugMatch = href.match(/^\/webtoon\/([^/?#]+)/);
      if (!slugMatch) return;
      const slug = slugMatch[1];
      if (seen.has(slug)) return;
      seen.add(slug);

      const title =
        $link.attr('title') ||
        $el.find('.data h3 a').attr('title') ||
        $el.find('.data h3 a').text().trim();
      const coverUrl =
        $link.find('img').attr('data-src') ||
        $link.find('img').attr('src') ||
        '';
      let updateDate = '';
      $el.find('.post-on').each((_, node) => {
        const text = $(node).text().trim();
        if (!updateDate && /\d{1,2}\s+[A-Za-z]+\s+\d{4}/.test(text)) {
          updateDate = text;
        }
      });

      cards.push({
        slug,
        title: title.trim(),
        coverUrl,
        updateDate,
        detailUrl: href.startsWith('http') ? href : `https://manhwa18.cc${href}`,
      });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const rawTitle = $('.post-title h1').first().text().trim();
    const title = rawTitle.replace(/^18\+/i, '').trim();

    const coverUrl =
      $('.summary_image img').attr('data-src') ||
      $('.summary_image img').attr('src') ||
      '';

    const authors: string[] = [];
    $('.author-content a[href*="/author/"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !authors.includes(name)) authors.push(name);
    });

    const genres: string[] = [];
    $('.genres-content a[href*="/webtoon-genre/"]').each((_, el) => {
      const name = $(el).text().trim();
      if (name && !genres.includes(name)) genres.push(name);
    });

    let status = 'unknown';
    $('.post-content_item').each((_, el) => {
      const label = $(el).find('h5').text().trim().toLowerCase();
      if (label === 'status') {
        const statusRaw = $(el).find('.summary-content').text().trim();
        if (/ongoing/i.test(statusRaw)) status = 'ongoing';
        else if (/complete|finished/i.test(statusRaw)) status = 'completed';
      }
    });

    const summary = $('.panel-story-description .dsct').text().trim();

    return { title, authors, genres, summary, coverUrl, status };
  }

  parseChapterList(html: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('ul.row-content-chapter li.a-h a.chapter-name').each((_, el) => {
      const $el = $(el);
      const viewerUrl = $el.attr('href') || '';
      const match = viewerUrl.match(/\/chapter-(\d+)/);
      if (!match) return;
      const title = ($el.attr('title') || $el.text()).trim();
      chapters.push({ chapterId: match[1], title, viewerUrl });
    });

    chapters.reverse();
    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('img.loading[data-src]').each((idx, el) => {
      const imageUrl = ($(el).attr('data-src') || '').trim();
      if (imageUrl) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  /**
   * 当前页是否还有下一页（分页组件中 next 未被禁用）。
   */
  hasNextPage(html: string): boolean {
    const $ = cheerio.load(html);
    return $('ul.pagination li.next').not('.disabled').length > 0;
  }
}
