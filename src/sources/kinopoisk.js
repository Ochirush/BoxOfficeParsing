const axios = require('axios');
const cheerio = require('cheerio');
const { delay } = require('../utils/delay');
const YAMLLoader = require('../utils/yamlLoader');
const { standardizeRevenue } = require('../utils/standardizeRevenue');

async function fetchKinopoisk() {
  try {
    console.log('Загрузка данных с Rotten Tomatoes...');

    const url = 'https://editorial.rottentomatoes.com/article/highest-grossing-movies-all-time/';

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.5',
        'Accept-Encoding': 'gzip, deflate, br',
        'Connection': 'keep-alive',
      },
      timeout: 30000
    });

    const $ = cheerio.load(response.data);
    const movies = [];

    $('.apple-news-media-block').each((index, element) => {
      try {
        const $block = $(element);

        const title = $block.find('.title strong').text().trim();
        const score = $block.find('.score strong').first().text().trim();
        const domesticText = $block.find('.details strong').first().text().trim();
        const releaseDateText = $block.find('.details strong').eq(1).text().trim();

        if (title && domesticText) {
          const revenueMatch = domesticText.match(/\$([\d,.]+)\s*(million|billion)/i);
          let revenueValue = 'N/A';
          let revenueString = 'N/A';

          if (revenueMatch) {
            const amount = parseFloat(revenueMatch[1].replace(/,/g, ''));
            const multiplier = revenueMatch[2].toLowerCase() === 'billion' ? 1000000000 : 1000000;
            const revenue = amount * multiplier;
            revenueString = revenueMatch[0]; // Например: "$2.9 billion"
            revenueValue = revenue.toString(); // Преобразуем число в строку для standardizeRevenue
          }

          const releaseDateMatch = releaseDateText.match(/Release date:\s*(.+)/i);
          const releaseDate = releaseDateMatch ? releaseDateMatch[1].trim() : '';

          const cleanScore = score.replace(/%/g, '');

          const movie = {
            title: title,
            rating: cleanScore ? `${cleanScore}%` : 'N/A',
            domesticRevenue: revenueMatch ? standardizeRevenue(revenueString) : 'N/A', // Передаем строку, а не число
            worldwideRevenue: revenueMatch ? standardizeRevenue(revenueString) : 'N/A', // Передаем строку, а не число
            releaseDate: releaseDate,
            source: 'Rotten Tomatoes'
          };

          movies.push(movie);
        }
      } catch (error) {
        console.error('Ошибка парсинга блока фильма:', error.message);
      }
    });

    if (movies.length === 0) {
      console.log('Пробуем альтернативные селекторы...');

      $('div').each((index, element) => {
        const $div = $(element);
        const text = $div.text();

        if (text.includes('$') && (text.includes('million') || text.includes('billion'))) {
          const title = $div.find('h3, h4, strong').first().text().trim();
          if (title && title.length > 0) {
            const revenueMatch = text.match(/\$([\d,.]+)\s*(million|billion)/i);
            if (revenueMatch) {
              const revenueString = revenueMatch[0]; // Получаем полную строку сбора

              const movie = {
                title: title,
                rating: 'N/A',
                domesticRevenue: standardizeRevenue(revenueString), // Передаем строку
                worldwideRevenue: standardizeRevenue(revenueString), // Передаем строку
                releaseDate: '',
                source: 'Rotten Tomatoes'
              };

              if (!movies.some(m => m.title === title)) {
                movies.push(movie);
              }
            }
          }
        }
      });
    }

    if (movies.length === 0) {
      throw new Error('Не удалось найти данные о фильмах на странице');
    }

    const result = {
      source: 'Rotten Tomatoes',
      totalMovies: movies.length,
      movies: movies,
      lastUpdated: new Date().toISOString(),
      error: null
    };

    YAMLLoader.saveData(result, './data/rotten_tomatoes.yaml');

    console.log(`Rotten Tomatoes: собрано ${movies.length} фильмов`);
    return result;

  } catch (error) {
    console.error('Ошибка при парсинге Rotten Tomatoes:', error.message);

    const errorResult = {
      source: 'Rotten Tomatoes',
      totalMovies: 0,
      movies: [],
      lastUpdated: new Date().toISOString(),
      error: error.message
    };

    return errorResult;
  }
}

module.exports = { fetchKinopoisk };