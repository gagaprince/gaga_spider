import * as cheerio from 'cheerio';

export interface ComicCard {
  comicId: string;
  title: string;
  coverUrl: string;
  status: string;
  detailUrl: string;
}

export interface ComicDetail {
  title: string;
  authors: string[];
  genres: string[];
  summary: string;
  coverUrl: string;
  status: string;
  rating: number | null;
  chapterCount: number;
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

export class DongmanhiParser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('ul.mh-list li .mh-item').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a').first();
      const detailUrl = $link.attr('href') || '';
      const comicIdMatch = detailUrl.match(/\/manhua\/(\d+)\//);
      if (!comicIdMatch) return;
      const comicId = comicIdMatch[1];
      if (seen.has(comicId)) return;
      seen.add(comicId);

      const coverUrl = $el.find('img.mh-cover').attr('src') || '';
      const title = $el
        .find('h2.title a')
        .text()
        .trim()
        .replace(/在线漫画$/, '');
      const status = $el.find('p.chapter span').text().trim();

      cards.push({ comicId, title, coverUrl, status, detailUrl });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('p.detail-info-title').text().trim();
    const coverUrl = $('img.detail-info-cover').attr('src') || '';
    const summary = $('p.detail-info-content').text().trim();

    const ratingText = $('p.detail-info-stars span').text().trim();
    const ratingMatch = ratingText.match(/([\d.]+)\s*分/);
    const rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;

    const tipText = $('p.detail-info-tip').text();
    const authorMatch = tipText.match(/作者[:：]\s*(.+?)(?:\s+状态[:：]|$)/s);
    const authors = authorMatch
      ? authorMatch[1]
          .split(/[,，、]/)
          .map((a) => a.replace(/[\s\n\t]+/g, ' ').trim())
          .filter((a) => a.length > 0)
      : [];

    const statusMatch = tipText.match(/状态[:：]\s*(\S+)/);
    const rawStatus = statusMatch ? statusMatch[1] : '';
    const status =
      rawStatus === '完结'
        ? 'completed'
        : rawStatus === '连载'
          ? 'ongoing'
          : 'unknown';

    const genreMatch = tipText.match(/类型[:：]\s*(.+)$/s);
    const genres = genreMatch
      ? genreMatch[1]
          .split(/[,，、]/)
          .map((g) => g.replace(/[\s\n\t]+/g, ' ').trim())
          .filter((g) => g.length > 0)
      : [];

    const chapterCountMatch = html.match(/共(\d+)章节/);
    const chapterCount = chapterCountMatch
      ? parseInt(chapterCountMatch[1], 10)
      : 0;

    return {
      title,
      authors,
      genres,
      summary,
      coverUrl,
      status,
      rating,
      chapterCount,
    };
  }

  parseChapterList(html: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('ul#mh-chapter-list-ol-0 li.detail-list-form-item a').each((_, el) => {
      const $el = $(el);
      const viewerUrl = $el.attr('href') || '';
      const title = $el.attr('title') || $el.text().trim();
      const chapterIdMatch = viewerUrl.match(/\/(\d+)\.html/);
      if (!chapterIdMatch) return;

      chapters.push({
        chapterId: chapterIdMatch[1],
        title,
        viewerUrl,
      });
    });

    // 页面为降序(最新在前),反转为升序(最早在前)
    chapters.reverse();
    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('#cp_img .lazyBox img.lazyload').each((idx, el) => {
      const $el = $(el);
      const imageUrl = $el.attr('data-original') || '';
      if (imageUrl) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  parsePagination(html: string): { totalPages: number } {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('.page-pagination a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/(\d+)\.html/);
      if (match) {
        const page = parseInt(match[1], 10);
        if (page > maxPage) maxPage = page;
      }
    });

    return { totalPages: maxPage };
  }
}
