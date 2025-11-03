const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');

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
    
    const movieLinks = $('a[href^="/title/tt"]');
    let rank = 1;
    
    movieLinks.each((index, link) => {
      if (moviesData.length >= imdbConfig.maxMovies) return false;
      
      const $link = $(link);
      const href = $link.attr('href');
      
      if (!href || !href.includes('/title/tt')) return;
      
      const movieElement = $link.closest('div, li, tr').length > 0 ? $link.closest('div, li, tr') : $link.parent();
      
      const title = getText($, movieElement, 'h3, h4, [data-testid="title"]');
      const url = 'https://www.imdb.com' + href;
      const id = href.split('/')[2];
      
      if (!title || title === 'N/A') return;
      
      const boxOfficeData = getBoxOfficeData($, movieElement);
      
      const movie = {
        rank: rank++,
        title: title,
        url: url,
        id: id,
        weekendGross: boxOfficeData.weekend || 'N/A',
        totalGross: boxOfficeData.total || 'N/A',
        scrapedAt: new Date().toISOString()
      };
      
      const isDuplicate = moviesData.some(m => m.id === movie.id);
      if (!isDuplicate) {
        moviesData.push(movie);
      }
    });
    
    console.log(`Найдено фильмов: ${moviesData.length}`);
    
    if (moviesData.length < imdbConfig.minMovies) {
      await alternativeIMDBParsing($, moviesData, imdbConfig.maxMovies);
    }
    
    if (imdbConfig.fetchDetailed) {
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

function getText($, element, selector) {
  const found = element.find(selector).first();
  return found.length > 0 ? found.text().trim() : 'N/A';
}

function getBoxOfficeData($, movieElement) {
  const boxOfficeData = {};
  
  let container = movieElement.find('[data-testid*="box-office"], [data-testid*="boxoffice"]').first();
  
  if (container.length === 0) {
    container = $('[data-testid*="box-office"], [data-testid*="boxoffice"]').first();
  }
  
  if (container.length === 0) {
    container = movieElement.find('ul, div').filter((index, el) => {
      const text = $(el).text();
      return text.includes('Gross') || text.includes('Budget') || text.includes('Opening');
    }).first();
  }
  
  if (container.length === 0) return boxOfficeData;
  
  const items = container.find('li, div[class*="item"], span[class*="item"]');
  
  items.each((index, item) => {
    const $item = $(item);
    const text = $item.text();
    
    const moneyMatch = text.match(/\$[\d,]+/g);
    if (!moneyMatch) return;
    
    const moneyValue = moneyMatch[0];
    
    if (text.includes('Total Gross') || text.includes('Cumulative')) {
      boxOfficeData.total = moneyValue;
    } else if (text.includes('Weekend Gross') || text.includes('Weekend')) {
      boxOfficeData.weekend = moneyValue;
    }
  });
  
  if (Object.keys(boxOfficeData).length === 0) {
    searchBoxOfficeInPage($, movieElement, boxOfficeData);
  }
  
  return boxOfficeData;
}

function searchBoxOfficeInPage($, movieElement, boxOfficeData) {
  const title = getText($, movieElement, 'h3, h4, [data-testid="title"]');
  
  if (title === 'N/A') return;
  
  const moneyElements = $('*:contains("$")');
  
  moneyElements.each((index, element) => {
    const $element = $(element);
    const text = $element.text();
    
    const isNearMovie = isElementNearMovie($, movieElement, $element);
    
    if (isNearMovie && text.includes('$')) {
      const moneyValue = text.match(/\$[\d,]+/)?.[0];
      if (!moneyValue) return;
      
      const parentText = $element.parent().text();
      
      if (!boxOfficeData.weekend && (text.includes('Weekend') || parentText.includes('Weekend'))) {
        boxOfficeData.weekend = moneyValue;
      } else if (!boxOfficeData.total && (text.includes('Total') || parentText.includes('Total') || text.includes('Cumulative'))) {
        boxOfficeData.total = moneyValue;
      }
    }
  });
}

function isElementNearMovie($, movieElement, testElement) {
  const movieContainer = movieElement.closest('div, li, tr');
  const testContainer = testElement.closest('div, li, tr');
  
  return movieContainer.length > 0 && testContainer.length > 0 && 
         movieContainer[0] === testContainer[0];
}

async function alternativeIMDBParsing($, moviesData, maxMovies) {
  const chartItems = $('[data-testid="chart-layout-main-column"] li, .ipc-metadata-list-summary-item');
  
  let rank = moviesData.length + 1;
  
  chartItems.each((index, item) => {
    if (moviesData.length >= maxMovies) return false;
    
    const $item = $(item);
    const titleLink = $item.find('a[href^="/title/tt"]').first();
    
    if (titleLink.length === 0) return;
    
    const title = getText($, $item, 'h3, h4, [data-testid="title"]');
    const href = titleLink.attr('href');
    const url = 'https://www.imdb.com' + href;
    const id = href.split('/')[2];
    
    if (!title || title === 'N/A') return;
    
    const boxOfficeData = extractBoxOfficeFromItem($, $item);
    
    const movie = {
      rank: rank++,
      title: title,
      url: url,
      id: id,
      weekendGross: boxOfficeData.weekend || 'N/A',
      totalGross: boxOfficeData.total || 'N/A',
      scrapedAt: new Date().toISOString(),
      method: 'alternative'
    };
    
    const isDuplicate = moviesData.some(m => m.id === movie.id);
    if (!isDuplicate) {
      moviesData.push(movie);
    }
  });
}

function extractBoxOfficeFromItem($, item) {
  const boxOfficeData = {};
  const text = item.text();
  
  const moneyMatches = text.match(/\$[\d,]+/g);
  if (!moneyMatches) return boxOfficeData;
  
  moneyMatches.forEach((money, index) => {
    if (index === 0 && !boxOfficeData.weekend) {
      boxOfficeData.weekend = money;
    } else if (index === 1 && !boxOfficeData.total) {
      boxOfficeData.total = money;
    }
  });
  
  return boxOfficeData;
}

module.exports = { fetchIMDB };