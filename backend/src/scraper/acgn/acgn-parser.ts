import * as cheerio from 'cheerio';

export interface ComicCard {
  slug: string;
  title: string;
  coverUrl: string;
  latestChapter: string;
  updateDate: string;
  summary: string;
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

export class AcgnParser {
  parseComicCards(html: string): ComicCard[] {
    const $ = cheerio.load(html);
    const cards: ComicCard[] = [];
    const seen = new Set<string>();

    $('div.content_block').each((_, el) => {
      const $el = $(el);
      const $titleLink = $el.find('.list_r h2 a').first();
      const href = $titleLink.attr('href') || '';
      const slugMatch = href.match(/\/manhua-(.+)\.htm/);
      if (!slugMatch) return;
      const slug = slugMatch[1];
      if (seen.has(slug)) return;
      seen.add(slug);

      const title = $titleLink.attr('title') || $titleLink.text().trim();
      const coverUrl = $el.find('.list_l img.thumb').attr('src') || '';
      const latestChapter = $el.find('.list_l .last').text().trim();

      const dateText = $el.find('.list_r').text();
      const dateMatch = dateText.match(/\[\s*(\d{4}-\d{2}-\d{2})\s*\]/);
      const updateDate = dateMatch ? dateMatch[1] : '';

      const summary = $el.find('.list_r p').text().trim();
      const detailUrl = href.startsWith('http')
        ? href
        : `https://comic.acgn.cc${href.startsWith('/') ? '' : '/'}${href}`;

      cards.push({
        slug,
        title,
        coverUrl,
        latestChapter,
        updateDate,
        summary,
        detailUrl,
      });
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('div.list_navbox h3 a').first().text().trim() ||
      $('#subheader h1').text().trim();

    const coverUrl =
      $('#item_intro .m img[alt]').first().attr('src') ||
      $('dl.gameshows dd img').first().attr('src') ||
      '';

    const authors: string[] = [];
    const genres: string[] = [];
    let status = 'unknown';

    $('#item_intro .m li.mss').each((_, el) => {
      const $li = $(el);
      const label = $li.clone().children().remove().end().text().trim();
      const value = $li.find('span').text().trim();

      if (label.includes('作者')) {
        value
          .split(/[&,，、]/)
          .map((a) => a.trim())
          .filter((a) => a.length > 0)
          .forEach((a) => authors.push(a));
      } else if (label.includes('狀態') || label.includes('状态')) {
        if (value.includes('連載') || value.includes('连载')) status = 'ongoing';
        else if (value.includes('完結') || value.includes('完结'))
          status = 'completed';
      } else if (label.includes('分類') || label.includes('分类')) {
        $li.find('span a').each((_, a) => {
          const name = $(a).text().trim();
          if (name) genres.push(name);
        });
      }
    });

    const summaryRaw = $('dl.gameshows dd')
      .last()
      .text()
      .replace(/\s+/g, ' ')
      .trim();
    const summary = summaryRaw
      .replace(/^[\s　]*/, '')
      .replace(/漫畫\s*$/, '')
      .trim();

    return { title, authors, genres, summary, coverUrl, status };
  }

  parseChapterList(html: string): ChapterItem[] {
    const $ = cheerio.load(html);
    const chapters: ChapterItem[] = [];

    $('#comic_chapter li a').each((_, el) => {
      const $el = $(el);
      const viewerUrl = $el.attr('href') || '';
      const match = viewerUrl.match(/view-(\d+)\.htm/);
      if (!match) return;
      const title = ($el.attr('title') || $el.text()).trim();
      chapters.push({
        chapterId: match[1],
        title,
        viewerUrl,
      });
    });

    chapters.reverse();
    return chapters;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('#pic_list div.pic[_src]').each((idx, el) => {
      const imageUrl = $(el).attr('_src') || '';
      if (imageUrl) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }

  parseLastPage(html: string): number {
    const $ = cheerio.load(html);
    let maxPage = 1;

    $('div.pagination a[rel="last"]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const match = href.match(/[?&]page=(\d+)/);
      if (match) {
        const page = parseInt(match[1], 10);
        if (page > maxPage) maxPage = page;
      }
    });

    if (maxPage === 1) {
      $('div.pagination a').each((_, el) => {
        const href = $(el).attr('href') || '';
        const match = href.match(/[?&]page=(\d+)/);
        if (match) {
          const page = parseInt(match[1], 10);
          if (page > maxPage) maxPage = page;
        }
      });
    }

    return maxPage;
  }
}
