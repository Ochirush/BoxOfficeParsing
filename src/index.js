const { fetchBoxOfficeMojo } = require('./sources/boxOfficeMojo');
const { fetchBoxOfficeMojoDetailed } = require('./sources/boxOfficeMojoDetailed');
const { fetchTheNumbers } = require('./sources/theNumbers');
const { fetchIMDB } = require('./sources/imdb');
const { fetchKinopoisk } = require('./sources/kinopoisk');

function summarizeMoviesResult(result) {
  if (!result) {
    return { totalMovies: 0, error: true, errorMessage: 'Результат недоступен' };
  }

  const { totalMovies = 0, error = false, errorMessage = null, source = 'Unknown' } = result;
  return { totalMovies, error: !!error, errorMessage, source };
}

function summarizeDetailedResult(result) {
  if (!result) {
    return { totalMovies: 0, successful: 0, failed: 0, error: true, errorMessage: 'Результат недоступен' };
  }

  const {
    totalMovies = 0,
    successful = 0,
    failed = 0,
    error = false,
    errorMessage = null,
    source = 'Unknown'
  } = result;

  return { totalMovies, successful, failed, error: !!error, errorMessage, source };
}

async function main() {
  try {
    const results = {};

    console.log('Сбор данных Box Office Mojo');
    const boxOfficeMojoResult = await fetchBoxOfficeMojo();
    results.boxOfficeMojo = summarizeMoviesResult(boxOfficeMojoResult);

    console.log('Сбор данных The Numbers');
    const theNumbersResult = await fetchTheNumbers();
    results.theNumbers = summarizeMoviesResult(theNumbersResult);

    console.log('Сбор данных IMDb Box Office');
    const imdbResult = await fetchIMDB();
    results.imdb = summarizeMoviesResult(imdbResult);

    console.log('Сбор данных Rotten Tomatoes');
    const kinopoiskResult = await fetchKinopoisk();
    results.rottenTomatoes = summarizeMoviesResult(kinopoiskResult);

    if (results.boxOfficeMojo && !results.boxOfficeMojo.error && results.boxOfficeMojo.totalMovies > 0) {
      console.log('Детализированный сбор данных Box Office Mojo');
      const detailedResult = await fetchBoxOfficeMojoDetailed();
      results.boxOfficeMojoDetailed = summarizeDetailedResult(detailedResult);
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