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

export class NniaoomanParser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('ul.col_3_1 > li').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a.ImgA').first();
      const href = $link.attr('href') || '';
      const slugMatch = href.match(/\/comic\/(.+)\.html/);
      if (!slugMatch) return;
      const slug = slugMatch[1];
      if (seen.has(slug)) return;
      seen.add(slug);

      const title = $link.attr('title') || $el.find('a.txtA').text().trim();
      const coverUrl = $link.find('img').attr('src') || '';
      const updateDate = $el.find('span.info').text().trim();

      cards.push({
        slug,
        title,
        coverUrl,
        updateDate,
        detailUrl: href.startsWith('http') ? href : `https://nnhm7.com${href}`,
      });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);
    const $intro = $('.Introduct');

    const rawTitle = $intro.find('.sub_r h1').text().trim();
    const title = rawTitle.replace(/^《|》$/g, '').trim();

    const coverUrl = $intro.find('#Cover img').attr('src') || '';

    const $txtItems = $intro.find('.sub_r .txtItme');
    let authors: string[] = [];
    const genres: string[] = [];

    $txtItems.each((idx, el) => {
      const $el = $(el);
      const $genreLinks = $el.find('a[href^="/comics/"]');
      const hasDate = $el.find('.date').length > 0;
      if ($genreLinks.length > 0) {
        $genreLinks.each((_, a) => {
          const name = $(a).text().trim();
          if (name) genres.push(name);
        });
      } else if (!hasDate) {
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text) {
          authors = text
            .split(/[&,，、]/)
            .map((a) => a.trim())
            .filter((a) => a.length > 0);
        }
      }
    });

    const dateText = $intro.find('.sub_r .date').text().trim();
    let status = 'unknown';
    if (dateText.includes('连载中')) status = 'ongoing';
    else if (dateText.includes('已完結') || dateText.includes('完结'))
      status = 'completed';

    const summaryRaw = $('.txtDesc').text().trim();
    const summary = summaryRaw.replace(/^介绍[:：]?\s*/, '').trim();

    return { title, authors, genres, summary, coverUrl, status };
  }

  parseChapterList(html: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('ul#mh-chapter-list-ol-0 > li > a').each((_, el) => {
      const $el = $(el);
      const viewerUrl = $el.attr('href') || '';
      const match = viewerUrl.match(/\/chapter-(\d+)\.html/);
      if (!match) return;
      const title = $el.find('span').text().trim() || $el.text().trim();
      chapters.push({ chapterId: match[1], title, viewerUrl });
    });

    chapters.reverse();
    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('#m_r_imgbox_0 img[data-src]').each((idx, el) => {
      const imageUrl = $(el).attr('data-src') || '';
      if (imageUrl) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  parseLastPage(html: string): number {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('.pagination-wrap a').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/\/page\/(\d+)/);
      if (match) {
        const page = parseInt(match[1], 10);
        if (page > maxPage) maxPage = page;
      }
    });

    return maxPage;
  }
}
