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
    
    console.log('Сбор данных Rotten Tomatoes');
    results.rottenTomatoes = await fetchKinopoisk();
    
    if (results.boxOfficeMojo && !results.boxOfficeMojo.error && results.boxOfficeMojo.totalMovies > 0) {
      console.log('Детализированный сбор данных Box Office Mojo');
      results.boxOfficeMojoDetailed = await fetchBoxOfficeMojoDetailed();
    }
    
    generateFinalReport(results);
    
  } catch (error) {
    console.error('Критическая ошибка:', error.message);
  }
}

function generateFinalReport(results) {

  const totalMovies = 
    (results.boxOfficeMojo && !results.boxOfficeMojo.error ? results.boxOfficeMojo.totalMovies : 0) +
    (results.theNumbers && !results.theNumbers.error ? results.theNumbers.totalMovies : 0) +
    (results.imdb && !results.imdb.error ? results.imdb.totalMovies : 0) +
    (results.rottenTomatoes && !results.rottenTomatoes.error ? results.rottenTomatoes.totalMovies : 0);
  
  console.log(`\nФИНАЛЬНЫЙ ОТЧЕТ:`);
  console.log(`Всего собрано фильмов: ${totalMovies}`);
  

  if (results.boxOfficeMojo && !results.boxOfficeMojo.error) {
    console.log(`Box Office Mojo: ${results.boxOfficeMojo.totalMovies} фильмов`);
  }
  if (results.theNumbers && !results.theNumbers.error) {
    console.log(`The Numbers: ${results.theNumbers.totalMovies} фильмов`);
  }
  if (results.imdb && !results.imdb.error) {
    console.log(`IMDb: ${results.imdb.totalMovies} фильмов`);
  }
  if (results.rottenTomatoes && !results.rottenTomatoes.error) {
    console.log(`Rotten Tomatoes: ${results.rottenTomatoes.totalMovies} фильмов`);
  }
  if (results.boxOfficeMojoDetailed && !results.boxOfficeMojoDetailed.error) {
    console.log(`Детализировано Box Office Mojo: ${results.boxOfficeMojoDetailed.detailedMovies} фильмов`);
  }
  
  console.log('Данные сохранены в папке data/');
}

process.on('unhandledRejection', (reason, promise) => {
  console.error('Необработанное исключение:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Неперехваченное исключение:', error.message);
  process.exit(1);
});

if (require.main === module) {
  main();
}

module.exports = { main };