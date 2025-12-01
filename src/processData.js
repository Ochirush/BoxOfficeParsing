const { Client } = require('pg');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');


const FIELD_MAPPINGS = {
  'worldwideGross': 'totalGross', 
  'worldwideRevenue': 'totalGross', 
  'domesticRevenue': 'domesticGross', 
  'weekend_gross': 'weekendGross', 
  'total_gross': 'totalGross', 
  'domestic_gross': 'domesticGross', 
  'international_gross': 'internationalGross' 
};


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
    scrapedAt: null
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
        if (normalized.hasOwnProperty(normalizedKey)) {
          normalized[normalizedKey] = value;
        }
        break;
    }
  }

  
  switch (source) {
    case 'Box Office Mojo':
    case 'Box Office Mojo - Detailed':
      
      break;
      
    case 'Rotten Tomatoes':
      
      if (normalized.domesticGross && !normalized.totalGross) {
        normalized.totalGross = normalized.domesticGross;
      }
      break;
      
    case 'IMDb Box Office':
      
      break;
      
    case 'The Numbers':
      
      break;
  }

  return normalized;
}


function readYAMLFilesFromDirectory(directoryPath) {
  try {
    const fileNames = fs.readdirSync(directoryPath);
    const yamlFiles = fileNames.filter(file => file.endsWith('.yaml'));

    const data = [];
    
    for (const fileName of yamlFiles) {
      try {
        const filePath = path.join(directoryPath, fileName);
        const fileContent = fs.readFileSync(filePath, 'utf8');
        const parsedData = yaml.load(fileContent);
        
        console.log(`Загружен файл: ${fileName}, фильмов: ${parsedData.movies?.length || 0}`);
        data.push(parsedData);
      } catch (fileError) {
        console.error(`Ошибка при чтении файла ${fileName}:`, fileError.message);
      }
    }

    return data;
  } catch (error) {
    console.error('Ошибка при чтении директории:', error.message);
    return [];
  }
}


async function createOrUpdateTable(client) {
  try {
    
    await client.query('DROP TABLE IF EXISTS movies');
    console.log('Старая таблица удалена (если существовала)');
    
    
    const createTableQuery = `
      CREATE TABLE movies (
          id SERIAL PRIMARY KEY,
          rank INTEGER,
          title VARCHAR(500) NOT NULL,
          year INTEGER,
          weekend_gross BIGINT,
          total_gross BIGINT,
          domestic_gross BIGINT,
          international_gross BIGINT,
          rating NUMERIC(4,1),
          release_date VARCHAR(100),
          source VARCHAR(100) NOT NULL,
          url TEXT,
          scraped_at TIMESTAMP NOT NULL,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          
          -- Индексы для быстрого поиска
          CONSTRAINT unique_movie_source_scraped UNIQUE (title, source, scraped_at)
      );
    `;
    
    await client.query(createTableQuery);
    console.log('Новая таблица movies создана');
    
    
    const createIndexesQuery = `
      CREATE INDEX idx_movies_title ON movies(title);
      CREATE INDEX idx_movies_source ON movies(source);
      CREATE INDEX idx_movies_scraped_at ON movies(scraped_at);
      CREATE INDEX idx_movies_rank ON movies(rank);
      CREATE INDEX idx_movies_total_gross ON movies(total_gross DESC);
      CREATE INDEX idx_movies_year ON movies(year);
    `;
    
    await client.query(createIndexesQuery);
    console.log('Индексы созданы');
    
  } catch (error) {
    console.error('Ошибка при создании таблицы:', error.message);
    throw error;
  }
}

//ВВВОДИТЬ ДАННЫЕ ДЛЯ БД
async function insertMoviesData(moviesData) {
  const client = new Client({
    user: 'admin',
    host: 'localhost',
    database: 'Box office',
    password: '12345',
    port: 5432,
  });

  try {
    await client.connect();
    console.log(`Подключено к базе данных. Всего фильмов для вставки: ${moviesData.length}`);

    
    await createOrUpdateTable(client);

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;

   
    for (let i = 0; i < moviesData.length; i++) {
      const movie = moviesData[i];
      
      try {
        
        const insertQuery = `
          INSERT INTO movies 
          (rank, title, year, weekend_gross, total_gross, domestic_gross, international_gross, rating, release_date, source, url, scraped_at)
          VALUES
          ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          ON CONFLICT (title, source, scraped_at) DO NOTHING
          RETURNING id
        `;

        
        const result = await client.query(insertQuery, [
          movie.rank,
          movie.title || 'Unknown',
          movie.year,
          movie.weekendGross,
          movie.totalGross,
          movie.domesticGross,
          movie.internationalGross,
          movie.rating,
          movie.releaseDate || null,
          movie.source || 'Unknown',
          movie.url || null,
          movie.scrapedAt || new Date().toISOString()
        ]);

        if (result.rows.length > 0) {
          successCount++;
          console.log(`[${i + 1}/${moviesData.length}] Фильм "${movie.title}" добавлен (ID: ${result.rows[0].id}).`);
        } else {
          duplicateCount++;
          console.log(`[${i + 1}/${moviesData.length}] Фильм "${movie.title}" уже существует, пропущен.`);
        }
        
      } catch (movieError) {
        errorCount++;
        console.error(`[${i + 1}/${moviesData.length}] Ошибка при добавлении фильма "${movie.title}":`, movieError.message);
        
       
        console.log('Данные фильма для отладки:', JSON.stringify(movie, null, 2));
      }
    }

    console.log(`\n=== ИТОГ ===`);
    console.log(`Успешно добавлено: ${successCount}`);
    console.log(`Дубликатов пропущено: ${duplicateCount}`);
    console.log(`Ошибок при добавлении: ${errorCount}`);
    console.log(`Всего обработано: ${moviesData.length}`);
    
  } catch (error) {
    console.error('Ошибка при работе с базой данных:', error.message);
    console.error('Полная ошибка:', error);
  } finally {
    await client.end();
    console.log('Соединение с базой данных закрыто.');
  }
}


async function processYAMLData() {
  const directoryPath = path.join(__dirname, '../data');
  const data = readYAMLFilesFromDirectory(directoryPath);

  if (data.length === 0) {
    console.log('Нет данных для обработки.');
    return;
  }

  const allMoviesData = [];

  
  data.forEach((sourceData, index) => {
    const source = sourceData.source || 'Unknown';
    console.log(`\nОбработка источника ${index + 1}: ${source}`);
    
    if (sourceData.movies && Array.isArray(sourceData.movies)) {
      sourceData.movies.forEach((movie, movieIndex) => {
        try {
          
          const normalizedMovie = normalizeMovieFields(movie, source);
          
          
          normalizedMovie.scrapedAt = normalizedMovie.scrapedAt || 
                                     movie.scrapedAt || 
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
          
          allMoviesData.push(normalizedMovie);
          
        } catch (error) {
          console.error(`Ошибка при обработке фильма ${movieIndex} из источника ${source}:`, error.message);
          console.log('Проблемный фильм:', movie);
        }
      });
      console.log(`Добавлено фильмов из этого источника: ${sourceData.movies.length}`);
    } else {
      console.log('В этом источнике нет фильмов или структура данных некорректна.');
    }
  });

  console.log(`\nВсего собрано фильмов: ${allMoviesData.length}`);
  
  
  const sourceStats = {};
  allMoviesData.forEach(movie => {
    sourceStats[movie.source] = (sourceStats[movie.source] || 0) + 1;
  });
  
  console.log('\nСтатистика по источникам:');
  Object.entries(sourceStats).forEach(([source, count]) => {
    console.log(`  ${source}: ${count} фильмов`);
  });
  
  
  console.log('\nПримеры нормализованных данных:');
  for (let i = 0; i < Math.min(3, allMoviesData.length); i++) {
    const movie = allMoviesData[i];
    console.log(`${i + 1}. "${movie.title}" (${movie.source})`);
    console.log(`   Total Gross: ${movie.totalGross}`);
    console.log(`   Domestic Gross: ${movie.domesticGross}`);
    console.log(`   Weekend Gross: ${movie.weekendGross}`);
    console.log(`   Year: ${movie.year}`);
    console.log('---');
  }

  
  await insertMoviesData(allMoviesData);
}


function validateMoviesData(moviesData) {
  console.log('\n=== ВАЛИДАЦИЯ ДАННЫХ ===');
  
  const issues = [];
  
  moviesData.forEach((movie, index) => {
    if (!movie.title || movie.title === 'Unknown') {
      issues.push(`Фильм ${index}: отсутствует название`);
    }
    
    if (!movie.source || movie.source === 'Unknown') {
      issues.push(`Фильм ${index} ("${movie.title}"): отсутствует источник`);
    }
    
    if (!movie.scrapedAt) {
      issues.push(`Фильм ${index} ("${movie.title}"): отсутствует дата скрапинга`);
    }
  });
  
  if (issues.length > 0) {
    console.log(`Найдено проблем: ${issues.length}`);
    issues.slice(0, 5).forEach(issue => console.log(`  - ${issue}`));
    if (issues.length > 5) {
      console.log(`  ... и еще ${issues.length - 5} проблем`);
    }
  } else {
    console.log('Все данные прошли базовую валидацию');
  }
  
  return issues.length === 0;
}


async function main() {
  try {
    console.log('=== НАЧАЛО ОБРАБОТКИ ДАННЫХ ===');
    await processYAMLData();
    
  } catch (error) {
    console.error('Критическая ошибка при обработке данных:', error);
    console.error('Стек ошибки:', error.stack);
    process.exit(1);
  }
}

main();