const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');
const { standardizeRevenue } = require('../utils/standardizeRevenue');
const { fetchHtmlWithLimit } = require('../utils/httpStream');

const BASE_URL = 'https://www.imdb.com';

async function fetchIMDB() {
  console.log('Сбор данных с IMDb Box Office...');

  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const imdbConfig = config.sources.imdb;

    const chartHtml = await fetchHtmlWithLimit(
      imdbConfig.chartUrl,
      {
        headers: imdbConfig.headers,
        timeout: 15000,
        gzip: true
      },
      config.settings?.maxResponseSize
    );

    const $ = cheerio.load(chartHtml);
    const moviesData = [];

    
    const movieContainers = $('div.sc-b4f120f6-0.bQhtuJ');
    
    console.log(`Найдено контейнеров с фильмами: ${movieContainers.length}`);

    movieContainers.each((index, container) => {
      if (moviesData.length >= imdbConfig.maxMovies) return false;

      const $container = $(container);
      
     
      const rank = moviesData.length + 1;
      
      
      const titleLink = $container.find('a.ipc-title-link-wrapper');
      const title = titleLink.find('h3.ipc-title__text').text().trim();
      const href = titleLink.attr('href');
      const url = href ? BASE_URL + href.split('?')[0] : 'N/A';
      const idMatch = href ? href.match(/title\/(tt\d+)/) : null;
      const id = idMatch ? idMatch[1] : `tt${Date.now()}${index}`;
      
      if (!title || title === 'N/A') return;

      
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
      
    });

    console.log(`Обработано фильмов: ${moviesData.length}`);

    
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


function getBoxOfficeData($, containerElement) {
  const boxOfficeData = {};
  
  
  const boxOfficeContainer = containerElement.find('[data-testid="title-metadata-box-office-data-container"]');
  
  if (boxOfficeContainer.length > 0) {
    
    boxOfficeContainer.find('li.sc-382281d-1.gPDhWQ').each((i, li) => {
      const $li = $(li);
      const label = $li.find('span').first().text().trim();
      const value = $li.find('span.sc-382281d-2').text().trim();
      
      
      
      if (label.includes('Weekend Gross')) {
        boxOfficeData.weekend = standardizeRevenue(value);
      } else if (label.includes('Total Gross')) {
        boxOfficeData.total = standardizeRevenue(value);
      }
    });
  } else {
    console.log('Контейнер с данными о сборах не найден, пробуем другие методы...');
    
    
    containerElement.find('li, div, span').each((i, elem) => {
      const text = $(elem).text().trim();
      if (text.includes('Weekend Gross') || text.includes('Total Gross')) {
        
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


async function alternativeIMDBParsing($, moviesData, maxMovies) {
  console.log('Используем альтернативный метод парсинга по всей странице...');
  
  
  const movieBlocks = $('div[class*="cli-children"], div[class*="sc-"]');
  const processedIds = new Set(moviesData.map(m => m.id));
  
  movieBlocks.each((index, block) => {
    if (moviesData.length >= maxMovies) return false;
    
    const $block = $(block);
    
    
    const titleElement = $block.find('h3.ipc-title__text, h4, [class*="title"]');
    const title = titleElement.text().trim();
    
    if (!title || title.length < 2) return;
    
    
    const link = $block.find('a[href*="/title/tt"]').first();
    const href = link.attr('href');
    if (!href) return;
    
    const idMatch = href.match(/title\/(tt\d+)/);
    if (!idMatch) return;
    
    const id = idMatch[1];
    
  
    if (processedIds.has(id)) return;
    processedIds.add(id);
    
    
    let weekendGross = 'N/A';
    let totalGross = 'N/A';
    
    
    $block.find('*').each((i, elem) => {
      const elemText = $(elem).text().trim();
      if (elemText.includes('Weekend Gross')) {
        
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

  const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
  const html = await fetchHtmlWithLimit(
    movie.url,
    {
      headers: headers,
      timeout: 15000,
      gzip: true
    },
    config.settings?.maxResponseSize
  );

  const $ = cheerio.load(html);

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