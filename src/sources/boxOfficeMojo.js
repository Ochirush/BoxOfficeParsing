const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');
const { standardizeRevenue } = require('../utils/standardizeRevenue');  // Импортируем функцию для стандартизации сборов

const BASE_URL = 'https://www.boxofficemojo.com';

async function fetchBoxOfficeMojo() {
  console.log('Сбор данных с Box Office Mojo...');

  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const mojoConfig = config.sources.boxOfficeMojo;

    const chartResponse = await new Promise((resolve, reject) => {
      request({
        url: mojoConfig.chartUrl,
        headers: mojoConfig.headers,
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
    let rank = 1;

    const rows = $('table.a-bordered tr');

    if (rows.length === 0) {
      const allRows = $('tr');
      console.log(`Всего строк на странице: ${allRows.length}`);
    }

    rows.each((index, row) => {
      if (moviesData.length >= mojoConfig.maxMovies) return false;

      const $row = $(row);
      const titleLink = $row.find('a[href*="/title/"]').first();
      if (titleLink.length === 0) return;

      const title = titleLink.text().trim();
      const href = titleLink.attr('href');

      const moneyCells = $row.find('td');
      let revenue = '';

      moneyCells.each((i, cell) => {
        const text = $(cell).text().trim();
        if (text.includes('$')) {
          revenue = text;
          return false;
        }
      });

      // Применяем стандартизацию сборов
      revenue = standardizeRevenue(revenue);

      const yearLink = $row.find('a[href*="/year/"]').first();
      const year = yearLink.length > 0 ? yearLink.text().trim() : 'N/A';

      if (title && revenue) {
        const movie = {
          rank: rank++,
          title: title,
          worldwideGross: revenue,
          year: year,
          url: href ? (href.startsWith('http') ? href : BASE_URL + href) : 'N/A',
          id: href ? href.split('/title/')[1]?.replace('/', '') : 'unknown',
          scrapedAt: new Date().toISOString()
        };

        moviesData.push(movie);
      }
    });

    console.log(`Найдено фильмов: ${moviesData.length}`);

    if (moviesData.length === 0) {
      await alternativeParsing($, moviesData, mojoConfig.maxMovies);
    }

    const resultData = {
      source: 'Box Office Mojo',
      sourceUrl: BASE_URL,
      chartUrl: mojoConfig.chartUrl,
      fetchedAt: new Date().toISOString(),
      totalMovies: moviesData.length,
      movies: moviesData
    };

    await saveData(resultData, 'boxoffice_mojo_data');
    console.log('Данные Box Office Mojo успешно сохранены!');

    return resultData;

  } catch (error) {
    console.error('Ошибка при сборе данных Box Office Mojo:', error.message);
    return {
      source: 'Box Office Mojo',
      sourceUrl: BASE_URL,
      error: true,
      errorMessage: error.message,
      fetchedAt: new Date().toISOString(),
      totalMovies: 0,
      movies: []
    };
  }
}

async function alternativeParsing($, moviesData, maxMovies) {
  console.log('Используем альтернативный метод парсинга...');

  const movieLinks = $('a[href*="/title/"]');
  let rank = 1;

  movieLinks.each((index, element) => {
    if (moviesData.length >= maxMovies) return false;

    const $link = $(element);
    const title = $link.text().trim();
    const href = $link.attr('href');

    if (!title || title.length < 2) return;

    const $row = $link.closest('tr');

    if ($row.length > 0) {
      const revenueCell = $row.find('td:contains("$")').first();
      const revenue = revenueCell.length > 0 ? revenueCell.text().trim() : 'N/A';

      // Применяем стандартизацию сборов
      const standardizedRevenue = standardizeRevenue(revenue);

      const yearLink = $row.find('a[href*="/year/"]').first();
      const year = yearLink.length > 0 ? yearLink.text().trim() : 'N/A';

      const movie = {
        rank: rank++,
        title: title,
        worldwideGross: standardizedRevenue,
        year: year,
        url: href ? (href.startsWith('http') ? href : BASE_URL + href) : 'N/A',
        id: href ? href.split('/title/')[1]?.replace('/', '') : 'unknown',
        scrapedAt: new Date().toISOString(),
        method: 'alternative'
      };

      const isDuplicate = moviesData.some(m => m.title === movie.title);
      if (!isDuplicate) {
        moviesData.push(movie);
      }
    }
  });
}

module.exports = { fetchBoxOfficeMojo };
