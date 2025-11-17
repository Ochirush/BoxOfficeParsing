const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');

const BASE_URL = 'https://www.kinopoisk.ru';

async function fetchKinopoisk() {
  console.log('Сбор данных с Кинопоиска...');
  
  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const kpConfig = config.sources.kinopoisk;
    
    let result = await tryAllApproaches(kpConfig);
    
    if (!result || result.movies.length === 0) {
      console.log('Все подходы не сработали');
      result = createEmptyData();
    }
    
    await saveData(result, 'kinopoisk_data');
    console.log('Данные Кинопоиска сохранены!');
    
    return result;
    
  } catch (error) {
    console.error('Ошибка при сборе данных Кинопоиска:', error.message);
    return createEmptyData();
  }
}

async function tryAllApproaches(kpConfig) {
  console.log('Пробуем разные методы обхода блокировки...');
  
  const approaches = [
    { name: 'Стандартный запрос', method: tryStandardRequest },
    { name: 'Расширенные headers', method: tryEnhancedHeaders },
    { name: 'Мобильная версия', method: tryMobileVersion },
    { name: 'Случайные задержки', method: tryRandomDelays }
  ];
  
  for (let approach of approaches) {
    console.log(`Подход: ${approach.name}...`);
    
    try {
      const result = await approach.method(kpConfig);
      
      if (result && result.movies && result.movies.length > 0) {
        console.log(`${approach.name} сработал! Найдено: ${result.movies.length} фильмов`);
        return result;
      }
    } catch (error) {
      console.log(`${approach.name} не сработал: ${error.message}`);
    }
    
    await delay(3000);
  }
  
  return null;
}

async function tryStandardRequest(kpConfig) {
  const headers = createRealisticHeaders();
  
  const response = await makeRequest(kpConfig.chartUrl, headers);
  const movies = await parseMoviesFromResponse(response.data, kpConfig.maxMovies);
  
  return {
    source: 'Kinopoisk - Топ мировых сборов',
    sourceUrl: BASE_URL,
    chartUrl: kpConfig.chartUrl,
    fetchedAt: new Date().toISOString(),
    totalMovies: movies.length,
    movies: movies,
    method: 'standard'
  };
}

async function tryEnhancedHeaders(kpConfig) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br, zstd',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'max-age=0',
    'Referer': 'https://www.kinopoisk.ru/',
    'DNT': '1'
  };
  
  const response = await makeRequest(kpConfig.chartUrl, headers);
  const movies = await parseMoviesFromResponse(response.data, kpConfig.maxMovies);
  
  return {
    source: 'Kinopoisk - Топ мировых сборов',
    sourceUrl: BASE_URL,
    chartUrl: kpConfig.chartUrl,
    fetchedAt: new Date().toISOString(),
    totalMovies: movies.length,
    movies: movies,
    method: 'enhanced_headers'
  };
}

async function tryMobileVersion(kpConfig) {
  const headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-ru',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive'
  };
  
  const response = await makeRequest(kpConfig.chartUrl, headers);
  const movies = await parseMoviesFromResponse(response.data, kpConfig.maxMovies);
  
  return {
    source: 'Kinopoisk - Топ мировых сборов',
    sourceUrl: BASE_URL,
    chartUrl: kpConfig.chartUrl,
    fetchedAt: new Date().toISOString(),
    totalMovies: movies.length,
    movies: movies,
    method: 'mobile'
  };
}

async function tryRandomDelays(kpConfig) {
  console.log('Имитируем человеческое поведение...');
  
  const headers = createRealisticHeaders();
  
  await delay(2000 + Math.random() * 3000);
  
  const response = await makeRequest(kpConfig.chartUrl, headers);
  
  await delay(1000 + Math.random() * 2000);
  
  const movies = await parseMoviesFromResponse(response.data, kpConfig.maxMovies);
  
  return {
    source: 'Kinopoisk - Топ мировых сборов',
    sourceUrl: BASE_URL,
    chartUrl: kpConfig.chartUrl,
    fetchedAt: new Date().toISOString(),
    totalMovies: movies.length,
    movies: movies,
    method: 'random_delays'
  };
}

function createRealisticHeaders() {
  const userAgents = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  ];
  
  const randomUserAgent = userAgents[Math.floor(Math.random() * userAgents.length)];
  
  return {
    'User-Agent': randomUserAgent,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
    'Accept-Encoding': 'gzip, deflate, br',
    'Connection': 'keep-alive',
    'Upgrade-Insecure-Requests': '1',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Referer': 'https://www.kinopoisk.ru/',
    'DNT': '1'
  };
}

function makeRequest(url, headers) {
  return new Promise((resolve, reject) => {
    console.log(`Запрос к: ${url}`);
    
    request({
      url: url,
      headers: headers,
      timeout: 25000,
      gzip: true,
      followAllRedirects: true,
      jar: true,
      rejectUnauthorized: false
    }, (error, response, body) => {
      if (error) {
        reject(error);
      } else if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      } else {
        console.log(`Ответ получен (${body.length} байт)`);
        
        if (body.includes('captcha') || body.includes('Доступ ограничен') || body.includes('bot')) {
          reject(new Error('Сайт заблокировал доступ (капча/антибот)'));
        }
        
        resolve({ data: body, response: response });
      }
    });
  });
}

async function parseMoviesFromResponse(html, maxMovies) {
  const $ = cheerio.load(html);
  const movies = [];
  
  console.log('Анализируем HTML структуру...');
  
  console.log(`Script тегов: ${$('script').length}`);
  console.log(`Div элементов: ${$('div').length}`);
  console.log(`Ссылок на фильмы: ${$('a[href*="/film/"]').length}`);
  
  const selectors = [
    'a[data-test-id="next-link"][href^="/film/"]',
    'a[href^="/film/"] .styles_mainTitle_RHG25',
    '.styles_root__a_veb a[href^="/film/"]',
    'a[href^="/film/"]'
  ];
  
  for (const selector of selectors) {
    const elements = $(selector);
    console.log(`Селектор "${selector}": ${elements.length} элементов`);
    
    if (elements.length > 0) {
      elements.each((index, element) => {
        if (movies.length >= maxMovies) return false;
        
        const $element = $(element);
        let title, url;
        
        if (selector.includes('a[')) {
          url = $element.attr('href');
          title = $element.find('.styles_mainTitle_RHG25').text().trim() || $element.text().trim();
        } else {
          const link = $element.closest('a[href^="/film/"]');
          url = link.attr('href');
          title = $element.text().trim();
        }
        
        if (title && url && title.length > 2) {
          const filmId = url.split('/').filter(Boolean).pop();
          
          const movie = {
            rank: movies.length + 1,
            title: cleanTitle(title),
            url: url.startsWith('http') ? url : BASE_URL + url,
            filmId: filmId,
            scrapedAt: new Date().toISOString()
          };
          
          const isDuplicate = movies.some(m => m.filmId === movie.filmId);
          if (!isDuplicate) {
            movies.push(movie);
            console.log(`${movie.rank}. ${movie.title}`);
          }
        }
      });
      
      if (movies.length > 0) break;
    }
  }
  
  if (movies.length > 0) {
    console.log('Получаем детальную информацию...');
    await getDetailedInfo(movies);
  }
  
  return movies;
}

function cleanTitle(title) {
  return title
    .replace(/\s+/g, ' ')
    .replace(/[\n\r\t]/g, '')
    .trim();
}

async function getDetailedInfo(movies) {
  for (let i = 0; i < Math.min(movies.length, 3); i++) {
    const movie = movies[i];
    
    try {
      console.log(`Детали для: ${movie.title}`);
      await delay(2000);
      
      const headers = createRealisticHeaders();
      const response = await makeRequest(movie.url, headers);
      const $ = cheerio.load(response.data);
      
      movie.originalTitle = $('.styles_originalTitle__nZWQK').text().trim() || 'N/A';
      
      movie.boxOffice = {
        usa: $('[data-test-id="usaBox"] a').text().trim() || 'N/A',
        world: $('[data-test-id="worldBox"] a').text().trim() || 'N/A'
      };
      
      movie.actors = [];
      const actorElements = $('li.styles_root__faLVg a.styles_link__FCSwj[itemprop="actor"]');
      
      actorElements.each((index, element)=>{
        if (index < 2) {
          const $element = $(element);
          movie.actors.push({
            russianName: $element.text().trim(),
            url: $element.attr('href') ? (BASE_URL + $element.attr('href')) : 'N/A',
            originalName: 'N/A'
          });
        }
      });
      
      console.log(`${movie.title} - ${movie.originalTitle}`);
      
    } catch (error) {
      console.log(`Ошибка деталей: ${error.message}`);
      movie.error = error.message;
    }
  }
}

function createEmptyData() {
  return {
    source: 'Kinopoisk - Топ мировых сборов',
    sourceUrl: BASE_URL,
    chartUrl: 'https://www.kinopoisk.ru/lists/movies/box-world-not-usa/',
    fetchedAt: new Date().toISOString(),
    totalMovies: 0,
    successful: 0,
    failed: 0,
    chartDescription: 'Топ фильмов по мировым сборам',
    movies: []
  };
}

module.exports = { fetchKinopoisk };