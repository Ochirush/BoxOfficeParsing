const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const YAMLLoader = require('../utils/yamlLoader');
const { standardizeRevenue } = require('../utils/standardizeRevenue');
const { fetchHtmlWithLimit } = require('../utils/httpStream');

async function fetchKinopoisk() {
  const url = 'https://editorial.rottentomatoes.com/article/highest-grossing-movies-all-time/';

  try {
    console.log('Загрузка данных с Rotten Tomatoes...');

    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const maxMovies =
      Number(config?.sources?.kinopoisk?.maxMovies) ||
      Number(config?.sources?.rottenTomatoes?.maxMovies) ||
      200;

    const headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate',
      'Connection': 'keep-alive',
    };

    const html = await fetchHtmlWithLimit(
      url,
      {
        headers,
        timeout: config.settings?.requestTimeout || 30000,
        gzip: true
      },
      config.settings?.maxResponseSize
    );

    const $ = cheerio.load(html);
    const movies = [];
    const seen = new Set();
    let rank = 1;

    const scope = $('article').length ? $('article') : $.root();

    const extractRevenueString = (text) => {
      if (!text) return null;
      const m1 = text.match(/\$[\d,.]+\s*(million|billion)/i);
      if (m1) return m1[0];
      const m2 = text.match(/\$[\d,.]+/);
      return m2 ? m2[0] : null;
    };

    const looksLikeHeader = (t) => {
      const s = t.toLowerCase();
      return (
        s === 'rank' ||
        s === 'movie' ||
        s === 'title' ||
        s.includes('domestic') ||
        s.includes('worldwide') ||
        s.includes('gross') ||
        s.includes('box office')
      );
    };

    const titleFromRow = ($row) => {
      const cells = $row.find('th, td');
      const texts = [];
      cells.each((i, c) => {
        const t = $(c).text().replace(/\s+/g, ' ').trim();
        if (t) texts.push(t);
      });
      const candidate = texts.find(t => !t.includes('$') && /[A-Za-zА-Яа-я]/.test(t) && !looksLikeHeader(t));
      return candidate || '';
    };

    const extractTitle = ($el) => {
      let title =
        $el.find('.title strong').first().text().trim() ||
        $el.find('a[href*="/title/"]').first().text().trim() ||
        $el.find('a[href*="/movie/"]').first().text().trim() ||
        $el.find('h1, h2, h3, h4').first().text().trim() ||
        $el.find('strong, b, em').first().text().trim() ||
        $el.find('a').first().text().trim();

      if (!title && $el.is('tr')) {
        title = titleFromRow($el);
      }

      if (!title || title.includes('$') || looksLikeHeader(title)) {
        const text = $el.text().replace(/\s+/g, ' ').trim();
        if (text) {
          const beforeDollar = text.split('$')[0].trim();
          const parts = beforeDollar.split('•').map(s => s.trim()).filter(Boolean);
          title = (parts[0] || beforeDollar).trim();
        }
      }

      return title;
    };

    const monthPattern = '(Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Sept|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)';
    const fullDateRe = new RegExp(`${monthPattern}\\s+\\d{1,2},\\s+\\d{4}`, 'i');

    const cleanReleaseDate = (text) => {
      if (!text) return '';
      const m = String(text).match(fullDateRe);
      return m ? m[0].trim() : '';
    };

    const extractReleaseDateFromRow = ($row) => {
      const cells = $row.find('th, td');
      let found = '';
      cells.each((i, c) => {
        const t = $(c).text().replace(/\s+/g, ' ').trim();
        if (!t) return;
        const d = cleanReleaseDate(t);
        if (d) {
          found = d;
          return false;
        }
      });
      return found;
    };

    const extractReleaseDate = ($el, text) => {
      let d = cleanReleaseDate(text);
      if (d) return d;

      if ($el.is('tr')) {
        d = extractReleaseDateFromRow($el);
        if (d) return d;
      }

      const localText =
        $el.find('.details strong').text().replace(/\s+/g, ' ').trim() ||
        $el.find('.details').text().replace(/\s+/g, ' ').trim();

      d = cleanReleaseDate(localText);
      return d || '';
    };

    const candidates = scope.find('tr, .apple-news-media-block, li, p');

    candidates.each((_, el) => {
      if (movies.length >= maxMovies) return false;

      const $el = $(el);
      const text = $el.text().replace(/\s+/g, ' ').trim();
      if (!text || !text.includes('$')) return;

      const revenueString = extractRevenueString(text);
      if (!revenueString) return;

      const title = extractTitle($el);
      if (!title || title.length < 2 || seen.has(title)) return;

      const releaseDate = extractReleaseDate($el, text);

      seen.add(title);

      movies.push({
        rank: rank++,
        title,
        rating: 'N/A',
        domesticRevenue: standardizeRevenue(revenueString),
        worldwideRevenue: standardizeRevenue(revenueString),
        releaseDate,
        source: 'Rotten Tomatoes'
      });
    });

    if (movies.length === 0) {
      throw new Error('Не удалось найти данные о фильмах на странице');
    }

    const result = {
      source: 'Rotten Tomatoes',
      sourceUrl: url,
      chartUrl: url,
      fetchedAt: new Date().toISOString(),
      totalMovies: movies.length,
      movies,
      error: false,
      errorMessage: null
    };

    await saveData(result, 'rotten_tomatoes_data');

    console.log(`Rotten Tomatoes: собрано ${movies.length} фильмов`);
    return result;

  } catch (error) {
    console.error('Ошибка при парсинге Rotten Tomatoes:', error.message);

    return {
      source: 'Rotten Tomatoes',
      sourceUrl: url,
      chartUrl: url,
      fetchedAt: new Date().toISOString(),
      totalMovies: 0,
      movies: [],
      error: true,
      errorMessage: error.message
    };
  }
}

module.exports = { fetchKinopoisk };
