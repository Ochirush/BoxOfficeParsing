const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');
const fs = require('fs').promises;
const path = require('path');
const { standardizeRevenue } = require('../utils/standardizeRevenue');  

const BASE_URL = 'https://www.boxofficemojo.com';

async function fetchBoxOfficeMojoDetailed() {
  console.log('Сбор детализированных данных с Box Office Mojo...');

  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const mojoConfig = config.sources.boxOfficeMojo;

    let basicMoviesData = [];
    try {
      const basicDataPath = path.join(__dirname, '../../data/boxoffice_mojo_data.yaml');
      const basicData = YAMLLoader.loadConfig(basicDataPath);
      basicMoviesData = basicData.movies || [];
      console.log(`Загружено ${basicMoviesData.length} фильмов для детализации`);
    } catch (error) {
      console.log('Не удалось загрузить базовые данные, собираем заново...');
      const { fetchBoxOfficeMojo } = require('./boxOfficeMojo');
      const basicResult = await fetchBoxOfficeMojo();
      basicMoviesData = basicResult.movies || [];
    }

    if (basicMoviesData.length === 0) {
      throw new Error('Нет данных о фильмах для детализации');
    }

    const detailedMoviesData = [];
    const progress = {
      total: Math.min(basicMoviesData.length, mojoConfig.detailedMaxMovies),
      completed: 0,
      failed: 0,
      startTime: new Date().toISOString()
    };

    for (let i = 0; i < progress.total; i++) {
      const movie = basicMoviesData[i];

      try {
        await delay(mojoConfig.delayBetweenRequests);

        const detailedMovie = await fetchMovieDetails(movie, mojoConfig.headers);
        detailedMoviesData.push(detailedMovie);
        progress.completed++;

        

      } catch (error) {
        console.error(`Ошибка при обработке фильма "${movie.title}":`, error.message);
        progress.failed++;

        detailedMoviesData.push({
          ...movie,
          error: true,
          errorMessage: error.message,
          detailed: false
        });
      }
    }

    const resultData = {
      source: 'Box Office Mojo - Detailed',
      sourceUrl: BASE_URL,
      fetchedAt: new Date().toISOString(),
      totalMovies: detailedMoviesData.length,
      successful: progress.completed,
      failed: progress.failed,
      processingTime: new Date().toISOString(),
      movies: detailedMoviesData
    };

    await saveData(resultData, 'boxoffice_mojo_detailed');
    console.log('Детализированные данные Box Office Mojo успешно сохранены!');

    return resultData;

  } catch (error) {
    console.error('Ошибка при сборе детализированных данных Box Office Mojo:', error.message);
    return {
      source: 'Box Office Mojo - Detailed',
      sourceUrl: BASE_URL,
      error: true,
      errorMessage: error.message,
      fetchedAt: new Date().toISOString(),
      totalMovies: 0,
      movies: []
    };
  }
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
    ...movie,
    detailed: true,
    scrapedAt: new Date().toISOString()
  };

  extractBoxOfficeData($, detailedInfo);

  const studioLink = $('a[href*="/studio/"]');
  if (studioLink.length > 0) {
    detailedInfo.studio = studioLink.first().text().trim();
  }

  const genreSpan = $('span:contains("Genre")').next('span');
  if (genreSpan.length > 0) {
    let genreText = genreSpan.text().trim();
    genreText = genreText.replace(/\s+/g, ' ').replace(/\n/g, ', ');
    detailedInfo.genre = genreText;
  }

  const ratingSpan = $('span:contains("Rating")').next('span');
  if (ratingSpan.length > 0) {
    detailedInfo.rating = ratingSpan.text().trim();
  }

  extractBudget($, detailedInfo);
  extractRuntime($, detailedInfo);

  return detailedInfo;
}

function extractBoxOfficeData($, detailedInfo) {
  const performanceSummary = $('.mojo-performance-summary');
  if (performanceSummary.length > 0) {
    const moneyValues = performanceSummary.find('.money');
    if (moneyValues.length >= 2) {
      detailedInfo.domesticGross = standardizeRevenue(moneyValues.eq(0).text().trim());  // Применяем стандартизацию
      detailedInfo.internationalGross = standardizeRevenue(moneyValues.eq(1).text().trim());  // Применяем стандартизацию
      return;
    }
  }

  const domesticLabel = $('span:contains("Domestic")').parent();
  if (domesticLabel.length > 0) {
    const domesticMoney = domesticLabel.find('.money').first();
    if (domesticMoney.length > 0) {
      detailedInfo.domesticGross = standardizeRevenue(domesticMoney.text().trim());  // Применяем стандартизацию
    }
  }

  const internationalLabel = $('span:contains("International")').parent();
  if (internationalLabel.length > 0) {
    const internationalMoney = internationalLabel.find('.money').first();
    if (internationalMoney.length > 0) {
      detailedInfo.internationalGross = standardizeRevenue(internationalMoney.text().trim());  // Применяем стандартизацию
    }
  }

  $('.mojo-table').each((index, table) => {
    const $table = $(table);
    const rows = $table.find('tr');

    rows.each((i, row) => {
      const $row = $(row);
      const cells = $row.find('td');

      if (cells.length >= 3) {
        const firstCell = cells.eq(0).text().trim();

        if (firstCell.includes('Domestic') || firstCell.includes('North America')) {
          const moneyCell = cells.find('.money').first();
          if (moneyCell.length > 0 && !detailedInfo.domesticGross) {
            detailedInfo.domesticGross = standardizeRevenue(moneyCell.text().trim());  // Применяем стандартизацию
          }
        }

        if (firstCell.includes('International') || firstCell.includes('Foreign')) {
          const moneyCell = cells.find('.money').first();
          if (moneyCell.length > 0 && !detailedInfo.internationalGross) {
            detailedInfo.internationalGross = standardizeRevenue(moneyCell.text().trim());  // Применяем стандартизацию
          }
        }
      }
    });
  });
}

function extractBudget($, detailedInfo) {
  const budgetLabel = $('span:contains("Budget")').parent();
  if (budgetLabel.length > 0) {
    const budgetMoney = budgetLabel.find('.money').first();
    if (budgetMoney.length > 0) {
      detailedInfo.budget = standardizeRevenue(budgetMoney.text().trim());  // Применяем стандартизацию
      return;
    }
  }

  $('td').each((index, cell) => {
    const $cell = $(cell);
    const text = $cell.text().trim();

    if (text === 'Budget' || text === 'Production Budget') {
      const nextCell = $cell.next('td');
      if (nextCell.length > 0) {
        const money = nextCell.find('.money').first();
        if (money.length > 0) {
          detailedInfo.budget = standardizeRevenue(money.text().trim());  // Применяем стандартизацию
          return false;
        }
      }
    }
  });
}

function extractRuntime($, detailedInfo) {
  const runtimeDiv = $('div.a-section.a-spacing-none').filter((i, el) => {
    return $(el).find('span').first().text().trim() === 'Running Time';
  });

  if (runtimeDiv.length > 0) {
    const runtimeSpan = runtimeDiv.find('span').last();
    if (runtimeSpan.length > 0) {
      detailedInfo.runtime = runtimeSpan.text().trim();
      return;
    }
  }

  const runtimeLabel = $('span:contains("Running Time")');
  if (runtimeLabel.length > 0) {
    const runtimeValue = runtimeLabel.next('span');
    if (runtimeValue.length > 0) {
      detailedInfo.runtime = runtimeValue.text().trim();
      return;
    }

    const parent = runtimeLabel.parent();
    const allSpans = parent.find('span');
    if (allSpans.length >= 2) {
      allSpans.each((i, span) => {
        if ($(span).text().trim() === 'Running Time' && i < allSpans.length - 1) {
          detailedInfo.runtime = $(allSpans[i + 1]).text().trim();
          return false;
        }
      });
      if (detailedInfo.runtime) return;
    }
  }

  $('td').each((index, cell) => {
    const $cell = $(cell);
    const text = $cell.text().trim();

    if (text === 'Running Time' || text === 'Runtime') {
      const nextCell = $cell.next('td');
      if (nextCell.length > 0) {
        detailedInfo.runtime = nextCell.text().trim();
        return false;
      }
    }
  });

  if (!detailedInfo.runtime) {
    detailedInfo.runtime = 'N/A';
  }
}

module.exports = { fetchBoxOfficeMojoDetailed };
