const request = require('request');
const cheerio = require('cheerio');
const { saveData } = require('../utils/saveData');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');

const BASE_URL = 'https://www.the-numbers.com';

async function fetchTheNumbers() {
  console.log('Сбор данных с The Numbers...');
  
  try {
    const config = YAMLLoader.loadConfig('./src/config/requests.yaml');
    const numbersConfig = config.sources.theNumbers;
    
    const chartResponse = await new Promise((resolve, reject) => {
      request({
        url: numbersConfig.chartUrl,
        headers: numbersConfig.headers,
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
    
    const table = $('#box_office_weekend_table');
    const rows = table.find('tr');
    
    let rank = 1;
    
    rows.each((index, row) => {
      if (moviesData.length >= numbersConfig.maxMovies) return false;
      
      const $row = $(row);
      const cells = $row.find('td');
      
      if (cells.length < 8) return;
      
      const titleLink = $row.find('a[href*="/movie/"]');
      
      if (titleLink.length === 0) return;
      
      const title = titleLink.text().trim();
      const movieUrl = titleLink.attr('href');
      
      const dataCells = $row.find('td.data');
      
      let weekendGross = '';
      let totalGross = '';
      let theaters = '';
      let averagePerTheater = '';
      
      if (dataCells.length >= 7) {
        weekendGross = dataCells.eq(2).text().trim();
        theaters = dataCells.eq(4).text().trim();
        averagePerTheater = dataCells.eq(6).text().trim();
        totalGross = dataCells.length > 7 ? dataCells.eq(7).text().trim() : '';
      }
      
      if (!totalGross && weekendGross) {
        totalGross = weekendGross;
      }
      
      if (title && weekendGross) {
        const movie = {
          rank: rank++,
          title: title,
          weekendGross: weekendGross,
          totalGross: totalGross || weekendGross,
          theaters: theaters || 'N/A',
          averagePerTheater: averagePerTheater || 'N/A',
          url: movieUrl ? (movieUrl.startsWith('http') ? movieUrl : BASE_URL + movieUrl) : 'N/A',
          scrapedAt: new Date().toISOString()
        };
        
        moviesData.push(movie);
      }
    });
    
    console.log(`Найдено фильмов: ${moviesData.length}`);
    
    if (moviesData.length === 0) {
      await enhancedAlternativeParsing($, moviesData, numbersConfig.maxMovies);
    }
    
    const resultData = {
      source: 'The Numbers',
      sourceUrl: BASE_URL,
      chartUrl: numbersConfig.chartUrl,
      fetchedAt: new Date().toISOString(),
      totalMovies: moviesData.length,
      chartType: 'Weekend Box Office',
      movies: moviesData
    };
    
    await saveData(resultData, 'the_numbers_data');
    console.log('Данные The Numbers успешно сохранены!');
    
    return resultData;
    
  } catch (error) {
    console.error('Ошибка при сборе данных The Numbers:', error.message);
    return {
      source: 'The Numbers',
      sourceUrl: BASE_URL,
      error: true,
      errorMessage: error.message,
      fetchedAt: new Date().toISOString(),
      totalMovies: 0,
      movies: []
    };
  }
}

async function enhancedAlternativeParsing($, moviesData, maxMovies) {
  const rows = $('tr');
  let rank = 1;
  
  rows.each((index, row) => {
    if (moviesData.length >= maxMovies) return false;
    
    const $row = $(row);
    const titleLink = $row.find('a[href*="/movie/"]');
    
    if (titleLink.length === 0) return;
    
    const title = titleLink.text().trim();
    const movieUrl = titleLink.attr('href');
    
    if (!title || title.length < 2) return;
    
    const moneyCells = $row.find('td:contains("$")');
    const numberCells = $row.find('td.data');
    
    let weekendGross = '';
    let totalGross = '';
    let theaters = '';
    let averagePerTheater = '';
    
    if (moneyCells.length >= 2) {
      weekendGross = moneyCells.eq(0).text().trim();
      
      if (moneyCells.length >= 3) {
        averagePerTheater = moneyCells.eq(2).text().trim();
        totalGross = moneyCells.eq(1).text().trim();
      } else {
        totalGross = moneyCells.eq(1).text().trim();
      }
    }
    
    numberCells.each((i, cell) => {
      const text = $(cell).text().trim().replace(/,/g, '');
      if (text && !isNaN(text) && parseInt(text) > 1000) {
        theaters = $(cell).text().trim();
        return false;
      }
    });
    
    if (!totalGross && weekendGross) {
      totalGross = weekendGross;
    }
    
    const movie = {
      rank: rank++,
      title: title,
      weekendGross: weekendGross || 'N/A',
      totalGross: totalGross || 'N/A',
      theaters: theaters || 'N/A',
      averagePerTheater: averagePerTheater || 'N/A',
      url: movieUrl ? (movieUrl.startsWith('http') ? movieUrl : BASE_URL + movieUrl) : 'N/A',
      scrapedAt: new Date().toISOString(),
      method: 'enhanced_alternative'
    };
    
    const isDuplicate = moviesData.some(m => m.title === movie.title);
    if (!isDuplicate && movie.weekendGross !== 'N/A') {
      moviesData.push(movie);
    }
  });
}

module.exports = { fetchTheNumbers };