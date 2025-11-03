const { fetchBoxOfficeMojo } = require('./sources/boxOfficeMojo');
const { fetchBoxOfficeMojoDetailed } = require('./sources/boxOfficeMojoDetailed');
const { fetchTheNumbers } = require('./sources/theNumbers');
const { fetchIMDB } = require('./sources/imdb');
const { fetchKinopoisk } = require('./sources/kinopoisk');

async function main() {
  try {
    const results = {};
    
    console.log('Сбор данных Box Office Mojo');
    results.boxOfficeMojo = await fetchBoxOfficeMojo();
    
    console.log('Сбор данных The Numbers');
    results.theNumbers = await fetchTheNumbers();
    
    console.log('Сбор данных IMDb Box Office');
    results.imdb = await fetchIMDB();
    
    console.log('Сбор данных Кинопоиска');
    results.kinopoisk = await fetchKinopoisk();
    
    if (results.boxOfficeMojo && !results.boxOfficeMojo.error && results.boxOfficeMojo.totalMovies > 0) {
      console.log('Детализированный сбор данных Box Office Mojo');
      results.boxOfficeMojoDetailed = await fetchBoxOfficeMojoDetailed();
    }
    
    generateFinalReport(results);
    
  } catch (error) {
    console.error('Критическая ошибка:');
  }
}

function generateFinalReport(results) {
  const totalMovies = 
    (results.boxOfficeMojo && !results.boxOfficeMojo.error ? results.boxOfficeMojo.totalMovies : 0) +
    (results.theNumbers && !results.theNumbers.error ? results.theNumbers.totalMovies : 0) +
    (results.imdb && !results.imdb.error ? results.imdb.totalMovies : 0) +
    (results.kinopoisk && !results.kinopoisk.error ? results.kinopoisk.totalMovies : 0);
  
  console.log(`Собрано фильмов: ${totalMovies}`);
  console.log('Данные сохранены в папке data/');
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное исключение:');
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Неперехваченное исключение:');
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { main };