const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');
const { standardizeRevenue } = require('../utils/standardizeRevenue');

const BASE_URL = 'https://www.imdb.com';

async function fetchIMDB() {
  console.log('Сбор данных с IMDb Box Office...');

  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const imdbConfig = config.sources.imdb;

    const chartResponse = await new Promise((resolve, reject) => {
      request({
        url: imdbConfig.chartUrl,
        headers: imdbConfig.headers,
        timeout: 15000,
        gzip: true
      }, (error, response, body) => {
        if (error) {
          reject(error);
        } else if (response.statusCode !== 200) {
          reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
        } else {
          resolve({ data: body, headers: response.headers });
        }
      });
    });

    const $ = cheerio.load(chartResponse.data);
    const moviesData = [];

    // Ищем все контейнеры с фильмами
    const movieContainers = $('div.sc-b4f120f6-0.bQhtuJ');
    
    console.log(`Найдено контейнеров с фильмами: ${movieContainers.length}`);

    movieContainers.each((index, container) => {
      if (moviesData.length >= imdbConfig.maxMovies) return false;

      const $container = $(container);
      
      // Получаем ранг из ссылки или по порядку
      const rank = moviesData.length + 1;
      
      // Получаем название фильма и ссылку
      const titleLink = $container.find('a.ipc-title-link-wrapper');
      const title = titleLink.find('h3.ipc-title__text').text().trim();
      const href = titleLink.attr('href');
      const url = href ? BASE_URL + href.split('?')[0] : 'N/A';
      const idMatch = href ? href.match(/title\/(tt\d+)/) : null;
      const id = idMatch ? idMatch[1] : `tt${Date.now()}${index}`;
      
      if (!title || title === 'N/A') return;

      // Получаем данные о сборах
      const boxOfficeData = getBoxOfficeData($, $container);

      const movie = {
        rank: rank,
        title: title,
        url: url,
        id: id,
        weekendGross: boxOfficeData.weekend || 'N/A',
        totalGross: boxOfficeData.total || 'N/A',
        scrapedAt: new Date().toISOString()
      };

      moviesData.push(movie);
      console.log(`Добавлен фильм: ${title} - Weekend: ${boxOfficeData.weekend || 'N/A'}, Total: ${boxOfficeData.total || 'N/A'}`);
    });

    console.log(`Обработано фильмов: ${moviesData.length}`);

    // Если фильмов меньше минимального, пробуем альтернативный парсинг
    if (moviesData.length < imdbConfig.minMovies) {
      console.log('Основной парсинг дал мало результатов, пробуем альтернативный метод...');
      await alternativeIMDBParsing($, moviesData, imdbConfig.maxMovies);
    }

    if (imdbConfig.fetchDetailed && moviesData.length > 0) {
      console.log('Сбор детализированных данных...');
      await fetchDetailedMovieData(moviesData, imdbConfig);
    }

    const resultData = {
      source: 'IMDb Box Office',
      sourceUrl: BASE_URL,
      chartUrl: imdbConfig.chartUrl,
      fetchedAt: new Date().toISOString(),
      totalMovies: moviesData.length,
      chartType: 'Weekend Box Office',
      movies: moviesData
    };

    await saveData(resultData, 'imdb_data');
    console.log('Данные IMDb успешно сохранены!');

    return resultData;

  } catch (error) {
    console.error('Ошибка при сборе данных IMDb:', error.message);
    return {
      source: 'IMDb Box Office',
      sourceUrl: BASE_URL,
      error: true,
      errorMessage: error.message,
      fetchedAt: new Date().toISOString(),
      totalMovies: 0,
      movies: []
    };
  }
}

// Исправленная функция для получения данных о сборах
function getBoxOfficeData($, containerElement) {
  const boxOfficeData = {};
  
  // Ищем контейнер с данными о сборах по data-testid
  const boxOfficeContainer = containerElement.find('[data-testid="title-metadata-box-office-data-container"]');
  
  if (boxOfficeContainer.length > 0) {
    // Проходим по всем элементам списка
    boxOfficeContainer.find('li.sc-382281d-1.gPDhWQ').each((i, li) => {
      const $li = $(li);
      const label = $li.find('span').first().text().trim();
      const value = $li.find('span.sc-382281d-2').text().trim();
      
      console.log(`Найдены данные: ${label} = ${value}`);
      
      if (label.includes('Weekend Gross')) {
        boxOfficeData.weekend = standardizeRevenue(value);
      } else if (label.includes('Total Gross')) {
        boxOfficeData.total = standardizeRevenue(value);
      }
    });
  } else {
    console.log('Контейнер с данными о сборах не найден, пробуем другие методы...');
    
    // Альтернативный поиск по тексту
    containerElement.find('li, div, span').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('Weekend Gross') || text.includes('Total Gross')) {
        // Ищем значение сбора в следующем элементе
        const value = $(elem).find('span').last().text().trim();
        if (value.includes('$')) {
          if (text.includes('Weekend Gross')) {
            boxOfficeData.weekend = standardizeRevenue(value);
          } else if (text.includes('Total Gross')) {
            boxOfficeData.total = standardizeRevenue(value);
          }
        }
      }
    });
  }
  
  return boxOfficeData;
}

// Альтернативный метод парсинга по структуре из HTML
async function alternativeIMDBParsing($, moviesData, maxMovies) {
  console.log('Используем альтернативный метод парсинга по всей странице...');
  
  // Ищем все блоки с фильмами по более общим селекторам
  const movieBlocks = $('div[class*="cli-children"], div[class*="sc-"]');
  const processedIds = new Set(moviesData.map(m => m.id));
  
  movieBlocks.each((index, block) => {
    if (moviesData.length >= maxMovies) return false;
    
    const $block = $(block);
    
    // Проверяем, содержит ли блок название фильма
    const titleElement = $block.find('h3.ipc-title__text, h4, [class*="title"]');
    const title = titleElement.text().trim();
    
    if (!title || title.length < 2) return;
    
    // Ищем ссылку
    const link = $block.find('a[href*="/title/tt"]').first();
    const href = link.attr('href');
    if (!href) return;
    
    const idMatch = href.match(/title\/(tt\d+)/);
    if (!idMatch) return;
    
    const id = idMatch[1];
    
    // Пропускаем дубликаты
    if (processedIds.has(id)) return;
    processedIds.add(id);
    
    // Ищем данные о сборах в этом блоке
    let weekendGross = 'N/A';
    let totalGross = 'N/A';
    
    // Ищем элементы с текстом "Weekend Gross" или "Total Gross"
    $block.find('*').each((i, elem) => {
      const elemText = $(elem).text().trim();
      if (elemText.includes('Weekend Gross')) {
        // Пытаемся найти значение сбора
        const nextSpan = $(elem).find('span.sc-382281d-2').first();
        if (nextSpan.length) {
          weekendGross = standardizeRevenue(nextSpan.text().trim());
        }
      } else if (elemText.includes('Total Gross')) {
        const nextSpan = $(elem).find('span.sc-382281d-2').first();
        if (nextSpan.length) {
          totalGross = standardizeRevenue(nextSpan.text().trim());
        }
      }
    });
    
    const movie = {
      rank: moviesData.length + 1,
      title: title,
      url: BASE_URL + href.split('?')[0],
      id: id,
      weekendGross: weekendGross,
      totalGross: totalGross,
      scrapedAt: new Date().toISOString()
    };
    
    moviesData.push(movie);
    console.log(`Альтернативный метод: ${title} - Weekend: ${weekendGross}, Total: ${totalGross}`);
  });
  
  console.log(`Альтернативным методом добавлено фильмов: ${moviesData.length - processedIds.size + processedIds.size}`);
}

// Остальные функции остаются без изменений
async function fetchDetailedMovieData(moviesData, imdbConfig) {
  const progress = {
    total: Math.min(moviesData.length, imdbConfig.detailedMaxMovies || moviesData.length),
    completed: 0,
    failed: 0
  };

  for (let i = 0; i < progress.total; i++) {
    const movie = moviesData[i];

    try {
      await delay(imdbConfig.delayBetweenRequests || 1000);

      const detailedInfo = await fetchMovieDetails(movie, imdbConfig.headers);
      Object.assign(movie, detailedInfo);

      progress.completed++;
      console.log(`Детализировано ${progress.completed}/${progress.total}: ${movie.title}`);

    } catch (error) {
      console.error(`Ошибка при детализации фильма "${movie.title}":`, error.message);
      progress.failed++;

      movie.director = 'N/A';
      movie.error = error.message;
    }
  }

  console.log(`Детализация завершена: успешно ${progress.completed}, ошибок ${progress.failed}`);
}

async function fetchMovieDetails(movie, headers) {
  if (!movie.url || movie.url === 'N/A') {
    throw new Error('URL фильма недоступен');
  }

  const response = await new Promise((resolve, reject) => {
    request({
      url: movie.url,
      headers: headers,
      timeout: 15000,
      gzip: true
    }, (error, response, body) => {
      if (error) {
        reject(error);
      } else if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}: ${response.statusMessage}`));
      } else {
        resolve({ data: body, headers: response.headers });
      }
    });
  });

  const $ = cheerio.load(response.data);

  const detailedInfo = {
    scrapedAt: new Date().toISOString()
  };

  detailedInfo.director = extractDirector($);

  return detailedInfo;
}

function extractDirector($) {
  const directorLabel = $('span.ipc-metadata-list-item__label:contains("Director"), span.ipc-metadata-list-item__label:contains("Directors")');

  if (directorLabel.length > 0) {
    const directorContainer = directorLabel.closest('li').find('.ipc-metadata-list-item__content-container, .ipc-metadata-list-item__list-content');

    if (directorContainer.length > 0) {
      const directorLinks = directorContainer.find('a.ipc-metadata-list-item__list-content-item');
      const directors = [];

      directorLinks.each((index, link) => {
        const directorName = $(link).text().trim();
        if (directorName && !directors.includes(directorName)) {
          directors.push(directorName);
        }
      });

      if (directors.length > 0) {
        return directors.join(', ');
      }
    }
  }

  return 'N/A';
}

module.exports = { fetchIMDB };