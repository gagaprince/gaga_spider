import * as cheerio from 'cheerio';

export interface ComicCard {
  slug: string;
  title: string;
  coverUrl: string;
  author: string;
  status: string;
  detailUrl: string;
  category: string;
}

export interface TagItem {
  tagId: string;
  name: string;
}

export interface ComicDetail {
  comicId: string;
  title: string;
  authors: string[];
  genres: string[];
  summary: string;
  coverUrl: string;
  status: string;
  rating: number | null;
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

export class ManhuazhanParser {
  parseComicCards(html: string, category = ''): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('.comic-list .comic-item').each((_, el) => {
      const $el = $(el);
      const $coverLink = $el.find('a.comic-cover');
      const href = $coverLink.attr('href') || '';
      const slugMatch = href.match(/\/comic_(.+)\.html/);
      if (!slugMatch) return;
      const slug = slugMatch[1];
      if (seen.has(slug)) return;
      seen.add(slug);

      const coverUrl = $coverLink.find('img').attr('src') || '';
      const title =
        $el.find('h3 a').attr('title') || $el.find('h3 a').text().trim();
      const author = $el.find('p.comic-author').text().trim();
      const status = $coverLink.find('.update-badge').text().trim();

      cards.push({
        slug,
        title,
        coverUrl,
        author,
        status,
        detailUrl: href.startsWith('http')
          ? href
          : `https://www.60ti.com${href}`,
        category,
      });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const rawTitle = $('.comic-meta-info h1').text().trim();
    const title = rawTitle.replace(/^《|》$/g, '');

    const coverUrl = $('.comic-cover-large img').attr('src') || '';
    const summary = $('.comic-description p').text().trim();

    let rating: number | null = null;
    $('.comic-stats .stat-item').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/评分[：:]\s*([\d.]+)/);
      if (match) rating = parseFloat(match[1]);
    });

    let authorText = '';
    $('.comic-stats .stat-item').each((_, el) => {
      const text = $(el).text();
      const match = text.match(/作者[：:]\s*(.+)/);
      if (match) authorText = match[1].trim();
    });
    const authors = authorText
      ? authorText
          .split(/[,，、]/)
          .map((a) => a.trim())
          .filter(Boolean)
      : [];

    const genres: string[] = [];
    let status = 'unknown';
    $('.comic-tags .tag').each((_, el) => {
      const tag = $(el).text().trim();
      if (tag === '已完结') {
        status = 'completed';
      } else if (tag === '连载中') {
        status = 'ongoing';
      } else if (tag) {
        genres.push(tag);
      }
    });

    const comicId = $('[data-id]').first().attr('data-id') || '';

    return {
      comicId,
      title,
      authors,
      genres,
      summary,
      coverUrl,
      status,
      rating,
    };
  }

  parseChapterList(html: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('#chapter-list .chapter-item a').each((_, el) => {
      const $el = $(el);
      const viewerUrl = $el.attr('href') || '';
      const title = $el.text().trim();
      const idMatch = viewerUrl.match(/\/chapter_\d+_(\d+)\.html/);
      if (!idMatch) return;

      chapters.push({
        chapterId: idMatch[1],
        title,
        viewerUrl: viewerUrl.startsWith('http')
          ? viewerUrl
          : `https://www.60ti.com${viewerUrl}`,
      });
    });

    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('img.comic-image').each((idx, el) => {
      const $el = $(el);
      const imageUrl = $el.attr('data-src') || $el.attr('src') || '';
      if (imageUrl) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  parseTagList(html: string): TagItem[] {
    const $ = cheerio.load(html);
    const tags: TagItem[] = [];
    const seen = new Set<string>();

    $('a.filter-item[href*="/category/tags/"]').each((_, el) => {
      const $el = $(el);
      const href = $el.attr('href') || '';
      const match = href.match(/\/category\/tags\/(\d+)/);
      if (!match) return;
      const tagId = match[1];
      if (seen.has(tagId)) return;
      seen.add(tagId);
      const name = $el.text().trim();
      if (name) tags.push({ tagId, name });
    });

    return tags;
  }

  parsePagination(html: string): { totalPages: number } {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('.pagination a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/page\/(\d+)/);
      if (match) {
        const page = parseInt(match[1], 10);
        if (page > maxPage) maxPage = page;
      }
    });

    return { totalPages: maxPage };
  }
}
