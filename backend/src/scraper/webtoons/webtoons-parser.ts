import * as cheerio from 'cheerio';

export interface GenreCard {
  titleNo: number;
  title: string;
  author: string;
  genre: string;
  languageCode: string;
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

export class WebtoonsParser {
  parseGenreCards(html: string): GenreCard[] {
    const $ = cheerio.load(html);
    const cards: GenreCard[] = [];

    $('a._genre_title_a').each((_, el) => {
      const $el = $(el);
      const listUrl = $el.attr('href') || '';
      const titleNo = parseInt($el.attr('data-title-no') || '0', 10);
      const genre = $el.attr('data-genre') || '';
      const languageCode = $el.attr('data-language-code') || '';
      const title = $el.find('.title').text().trim();
      const author = $el.find('.author').text().trim();
      const coverUrl = $el.find('img').attr('src') || '';
      const likeCount = $el.find('.view_count').text().trim();
      const adult =
        $el.find('.image_wrap').attr('data-title-unsuitable-for-children') ===
        'true';

      if (titleNo > 0 && listUrl) {
        cards.push({
          titleNo,
          title,
          author,
          genre,
          languageCode,
          listUrl,
          coverUrl,
          likeCount,
          adult,
        });
      }
    });

    return cards;
  }

  parseDetail(html: string): ComicDetail {
    const $ = cheerio.load(html);

    const title = $('h1.subj').text().trim();
    const genre = $('h2.genre').text().trim();
    const summary = $('p.summary').text().trim();
    const coverUrl = $('.detail_body .thmb img').attr('src') || '';

    const authorAreaText = $('.author_area').text().trim();
    const authors = authorAreaText
      .replace(/作家資訊|author info/gi, '')
      .split(/[,，]/)
      .map((a) => a.replace(/[\s\n\t]+/g, ' ').trim())
      .filter((a) => a.length > 0 && a.length < 50);

    const detailInfoText = $('.detail_info').text().trim();
    const isUp = detailInfoText.includes('UP');
    const isCompleted = /completed|完結/i.test(detailInfoText);
    const status = isCompleted ? 'completed' : isUp ? 'ongoing' : 'unknown';

    const updateDayMatch = detailInfoText.match(/UP\s+(?:EVERY\s+)?(\w+)/i);
    const updateDay = updateDayMatch ? updateDayMatch[1] : '';

    const viewCount = $('.detail_info .grade_num').first().text().trim();
    const subscribeMatch = detailInfoText.match(/subscribe\s*([\d,]+)/i);
    const subscribeCount = subscribeMatch ? subscribeMatch[1] : '';

    return {
      title,
      authors,
      genre,
      summary,
      coverUrl,
      status,
      updateDay,
      viewCount,
      subscribeCount,
      rating: null,
    };
  }

  parseEpisodeList(html: string): EpisodeItem[] {
    const $ = cheerio.load(html);
    const episodes: EpisodeItem[] = [];

    $('#_listUl li._episodeItem').each((_, el) => {
      const $el = $(el);
      const episodeNo = parseInt($el.attr('data-episode-no') || '0', 10);
      const viewerUrl = $el.find('.detail_list_link').attr('href') || '';
      const title = $el.find('.subj').text().trim();
      const thumbnail = $el.find('img').attr('src') || '';
      const dateText = $el.find('.date').text().trim();
      const likeText = $el.find('.like_count, .ico_like').text().trim();

      if (episodeNo > 0) {
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
