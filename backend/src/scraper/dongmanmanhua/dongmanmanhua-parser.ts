import * as cheerio from 'cheerio';

export interface GenreCard {
  titleNo: number;
  title: string;
  author: string;
  genre: string;
  listUrl: string;
  coverUrl: string;
  likeCount: string;
  adult: boolean;
}

export interface ComicDetail {
  title: string;
  authors: string[];
  genre: string;
  summary: string;
  coverUrl: string;
  status: string;
  updateDay: string;
  viewCount: string;
  subscribeCount: string;
  rating: string | null;
}

export interface EpisodeItem {
  episodeNo: number;
  title: string;
  viewerUrl: string;
  thumbnail: string;
  publishedDate: string;
  likeCount: string;
}

export interface ViewerImage {
  orderIndex: number;
  imageUrl: string;
}

export class DongmanmanhuaParser {
  parseGenreCards(html: string): GenreCard[] {
    const $ = cheerio.load(html);
    const cards: GenreCard[] = [];

    $('li[data-title-no]').each((_, el) => {
      const $el = $(el);
      const $link = $el.find('a.card_item').first();
      const href = $link.attr('href') || '';
      const listUrl = href.startsWith('http') ? href : `https:${href}`;
      const titleNo = parseInt($el.attr('data-title-no') || '0', 10);

      // 类型来自路径第一段: //www.dongmanmanhua.cn/LOVE/{slug}/list?title_no=...
      const pathMatch = listUrl.match(/dongmanmanhua\.cn\/([A-Z0-9_]+)\//);
      const genre = pathMatch ? pathMatch[1] : '';

      const title = $link.find('.subj').text().trim();
      const author = $link.find('.author').text().trim();
      const coverUrl = $link.find('img').attr('src') || '';
      const likeCount = $link.find('.grade_num').text().trim();

      if (titleNo > 0 && listUrl) {
        cards.push({
          titleNo,
          title,
          author,
          genre,
          listUrl,
          coverUrl,
          likeCount,
          adult: false,
        });
      }
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('h1.subj').text().trim();
    const summary = $('p.summary').text().trim();
    const detailBgStyle = $('.detail_body').attr('style') || '';
    const bgMatch = detailBgStyle.match(
      /background(?:-image)?\s*:[^;]*url\(([^)]+)\)/i,
    );
    const coverUrl =
      (bgMatch ? bgMatch[1].replace(/^['"]|['"]$/g, '') : '') ||
      $('.detail_body img').attr('src') ||
      '';

    const authorArea = $('span.author').first().text().trim();
    const authors = authorArea
      .replace(/作家信息|作家資訊|author info/gi, '')
      .split(/[,，]/)
      .map((a) => a.replace(/[\s\n\t]+/g, ' ').trim())
      .filter((a) => a.length > 0 && a.length < 50);

    // 类型取自面包屑/分类按钮区域的 genre 路径, 兜底为空
    const genre = '';

    // 更新状态: p.day_info 文本含 "完结" 为 completed, 否则按更新日判 ongoing
    const dayInfoText = $('p.day_info').text().trim();
    const isCompleted = /完结/.test(dayInfoText);
    const status = isCompleted
      ? 'completed'
      : dayInfoText
        ? 'ongoing'
        : 'unknown';

    const dayMatch = dayInfoText.match(/在周(.+?)更新/);
    const updateDay = dayMatch ? dayMatch[1] : '';

    return {
      title,
      authors,
      genre,
      summary,
      coverUrl,
      status,
      updateDay,
      viewCount: '',
      subscribeCount: '',
      rating: null,
    };
  }

  parseEpisodeList(html: string): EpisodeItem[] {
    const $ = cheerio.load(html);
    const episodes: EpisodeItem[] = [];

    $('#_listUl li[data-episode-no]').each((_, el) => {
      const $el = $(el);
      const episodeNo = parseInt($el.attr('data-episode-no') || '0', 10);
      const href = $el.find('a').first().attr('href') || '';
      const viewerUrl = href.startsWith('http') ? href : `https:${href}`;
      const title =
        $el.find('.subj span').first().text().trim() ||
        $el.find('.subj').text().trim();
      const thumbnail = $el.find('.thmb img').attr('src') || '';
      const dateText = $el.find('.date').text().trim();
      const likeText = $el.find('.like_area, .ico_like').text().trim();

      if (episodeNo > 0 && viewerUrl) {
        episodes.push({
          episodeNo,
          title,
          viewerUrl,
          thumbnail,
          publishedDate: dateText,
          likeCount: likeText,
        });
      }
    });

    return episodes;
  }

  parseViewerImages(html: string): ViewerImage[] {
    const $ = cheerio.load(html);
    const images: ViewerImage[] = [];

    $('#_imageList img._images').each((idx, el) => {
      const $el = $(el);
      const imageUrl = $el.attr('data-url') || $el.attr('src') || '';
      if (imageUrl && !imageUrl.includes('bg_transparency')) {
        images.push({ orderIndex: idx + 1, imageUrl });
      }
    });

    return images;
  }
}
