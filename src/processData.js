const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const sequelize = require('./db/connection');
const Movie = require('./db/models/Movie');

const FIELD_MAPPINGS = {
  worldwideGross: 'totalGross',
  worldwideRevenue: 'totalGross',
  domesticRevenue: 'domesticGross',
  weekend_gross: 'weekendGross',
  total_gross: 'totalGross',
  domestic_gross: 'domesticGross',
  international_gross: 'internationalGross',
};

const INSERT_BATCH_SIZE = 500;

function standardizeRevenueForDB(revenue) {
  if (!revenue || revenue === 'N/A' || revenue === 'n/a' || revenue === '' || revenue === null || revenue === undefined) {
    return null;
  }

  if (typeof revenue === 'number') {
    return revenue;
  }

  if (typeof revenue === 'string') {
    revenue = revenue.trim();

    if (/^\d+$/.test(revenue)) {
      return parseInt(revenue);
    }

    const match = revenue.match(/\$?([\d,\.]+)/);
    if (match) {
      const amount = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(amount)) {
        const revenueLower = revenue.toLowerCase();
        if (revenueLower.includes('billion') || revenueLower.includes('b')) {
          return Math.round(amount * 1000000000);
        } else if (revenueLower.includes('million') || revenueLower.includes('m')) {
          return Math.round(amount * 1000000);
        } else if (revenueLower.includes('k') || revenueLower.includes('тыс')) {
          return Math.round(amount * 1000);
        }
        return Math.round(amount);
      }
    }
  }

  return null;
}

function normalizeMovieFields(movie, source) {
  const normalized = {
    rank: null,
    title: null,
    year: null,
    weekendGross: null,
    totalGross: null,
    domesticGross: null,
    internationalGross: null,
    rating: null,
    releaseDate: null,
    source: source,
    url: null,
    scrapedAt: null,
  };

  for (const [key, value] of Object.entries(movie)) {
    const normalizedKey = FIELD_MAPPINGS[key] || key;

    switch (normalizedKey) {
      case 'rank':
      case 'year':
        normalized[normalizedKey] = value !== null && value !== undefined ? parseInt(value) || null : null;
        break;

      case 'weekendGross':
      case 'totalGross':
      case 'domesticGross':
      case 'internationalGross':
        normalized[normalizedKey] = standardizeRevenueForDB(value);
        break;

      case 'rating':
        if (value && typeof value === 'string') {
          const ratingMatch = value.match(/(\d+(\.\d+)?)/);
          normalized.rating = ratingMatch ? parseFloat(ratingMatch[1]) : null;
        } else {
          normalized.rating = value;
        }
        break;

      default:
        if (Object.prototype.hasOwnProperty.call(normalized, normalizedKey)) {
          normalized[normalizedKey] = value;
        }
        break;
    }
  }

  if (source === 'Rotten Tomatoes') {
    if (normalized.domesticGross && !normalized.totalGross) {
      normalized.totalGross = normalized.domesticGross;
    }
  }

  return normalized;
}

function* readYAMLFilesFromDirectory(directoryPath) {
  const fileNames = fs.readdirSync(directoryPath);
  const yamlFiles = fileNames.filter(file => file.endsWith('.yaml'));

  for (const fileName of yamlFiles) {
    try {
      const filePath = path.join(directoryPath, fileName);
      const fileContent = fs.readFileSync(filePath, 'utf8');
      const parsedData = yaml.load(fileContent);

      console.log(`Загружен файл: ${fileName}, фильмов: ${parsedData.movies?.length || 0}`);
      yield parsedData;
    } catch (fileError) {
      console.error(`Ошибка при чтении файла ${fileName}:`, fileError.message);
    }
  }
}

async function insertMoviesBatch(moviesBatch) {
  if (moviesBatch.length === 0) return;

  try {
    await Movie.bulkCreate(moviesBatch, { ignoreDuplicates: true });
    console.log(`Сохранено фильмов: ${moviesBatch.length}`);
  } catch (error) {
    console.error('Ошибка при сохранении партии фильмов:', error.message);
  }
}

async function processYAMLData() {
  const directoryPath = path.join(__dirname, '../data');
  const sourcesIterator = readYAMLFilesFromDirectory(directoryPath);

  let totalMoviesProcessed = 0;
  const sourceStats = {};

  for (const sourceData of sourcesIterator) {
    const source = sourceData.source || 'Unknown';
    const movies = Array.isArray(sourceData.movies) ? sourceData.movies : [];

    console.log(`\nОбработка источника: ${source}`);

    let batch = [];

    for (let movieIndex = 0; movieIndex < movies.length; movieIndex++) {
      try {
        const normalizedMovie = normalizeMovieFields(movies[movieIndex], source);
        normalizedMovie.scrapedAt = normalizedMovie.scrapedAt ||
                                   movies[movieIndex].scrapedAt ||
                                   sourceData.fetchedAt ||
                                   sourceData.lastUpdated ||
                                   new Date().toISOString();

        if (!normalizedMovie.year && normalizedMovie.releaseDate) {
          const yearMatch = normalizedMovie.releaseDate.toString().match(/(\d{4})/);
          if (yearMatch) {
            normalizedMovie.year = parseInt(yearMatch[1]);
          }
        }

        if (!normalizedMovie.year && normalizedMovie.title) {
          const yearMatch = normalizedMovie.title.match(/\((\d{4})\)/);
          if (yearMatch) {
            normalizedMovie.year = parseInt(yearMatch[1]);
            normalizedMovie.title = normalizedMovie.title.replace(/\s*\(\d{4}\)\s*$/, '').trim();
          }
        }

        batch.push(normalizedMovie);
        totalMoviesProcessed++;
        sourceStats[source] = (sourceStats[source] || 0) + 1;

        if (batch.length >= INSERT_BATCH_SIZE) {
          await insertMoviesBatch(batch);
          batch = [];
        }
      } catch (error) {
        console.error(`Ошибка при обработке фильма ${movieIndex} из источника ${source}:`, error.message);
        console.log('Проблемный фильм:', movies[movieIndex]);
      }
    }

    if (batch.length > 0) {
      await insertMoviesBatch(batch);
    }
  }

  console.log(`\nВсего обработано фильмов: ${totalMoviesProcessed}`);
  console.log('\nСтатистика по источникам:');
  Object.entries(sourceStats).forEach(([src, count]) => {
    console.log(`  ${src}: ${count} фильмов`);
  });
}

async function ensureSchema() {
  await sequelize.authenticate();
  await Movie.sync();
}

async function main() {
  try {
    console.log('=== НАЧАЛО ОБРАБОТКИ ДАННЫХ ===');
    await ensureSchema();
    await processYAMLData();
  } catch (error) {
    console.error('Критическая ошибка при обработке данных:', error);
    console.error('Стек ошибки:', error.stack);
    process.exit(1);
  } finally {
    await sequelize.close();
  }
}

main();

