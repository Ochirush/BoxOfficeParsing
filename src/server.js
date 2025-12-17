const path = require('path');
const express = require('express');
const { Op } = require('sequelize');
const sequelize = require('./db/connection');
const Movie = require('./db/models/Movie');

const app = express();
const PORT = process.env.PORT || 3000;

const normalizeTitle = (title = '') => title.trim().toLowerCase();

const chooseBestRecord = (current, candidate) => {
  if (!current) return candidate;
  if (candidate.totalGross > current.totalGross) return candidate;

  const currentDate = current.scrapedAt ? new Date(current.scrapedAt).getTime() : 0;
  const candidateDate = candidate.scrapedAt ? new Date(candidate.scrapedAt).getTime() : 0;

  return candidate.totalGross === current.totalGross && candidateDate > currentDate
    ? candidate
    : current;
};

const toValidYear = (year) => {
  const parsed = Number(year);
  if (!Number.isFinite(parsed)) return null;

  const intYear = Math.trunc(parsed);
  return intYear >= 1800 && intYear <= 3000 ? intYear : null;
};

const calculateFiveNumber = (values) => {
  if (!Array.isArray(values) || values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const median = (arr) => {
    const len = arr.length;
    const mid = Math.floor(len / 2);
    return len % 2 === 0 ? (arr[mid - 1] + arr[mid]) / 2 : arr[mid];
  };

  const midIndex = Math.floor(sorted.length / 2);
  const lowerHalf = sorted.slice(0, midIndex);
  const upperHalf = sorted.slice(sorted.length % 2 === 0 ? midIndex : midIndex + 1);

  const q1 = median(lowerHalf.length ? lowerHalf : sorted);
  const q3 = median(upperHalf.length ? upperHalf : sorted);

  return {
    min: sorted[0],
    q1,
    median: median(sorted),
    q3,
    max: sorted[sorted.length - 1],
  };
};

async function buildDashboardMetrics() {
  const latestScrape = await Movie.max('scrapedAt');

  const moviesRaw = await Movie.findAll({
    attributes: ['title', 'year', 'source', 'totalGross', 'scrapedAt'],
    where: { totalGross: { [Op.ne]: null } },
    raw: true,
  });

  const overallMap = new Map();
  const bySourceMap = new Map();
  const byYearMap = new Map();

  moviesRaw.forEach((movie) => {
    const gross = Number(movie.totalGross);
    if (!Number.isFinite(gross)) return;

    const source = movie.source || 'Неизвестно';
    const normalizedYear = toValidYear(movie.year);
    const key = `${normalizeTitle(movie.title || '')}::${normalizedYear ?? '—'}`;
    const normalizedMovie = { ...movie, source, year: normalizedYear, totalGross: gross };

    const existingOverall = overallMap.get(key);
    overallMap.set(key, chooseBestRecord(existingOverall, normalizedMovie));

    const sourceMap = bySourceMap.get(source) || new Map();
    const existingBySource = sourceMap.get(key);
    sourceMap.set(key, chooseBestRecord(existingBySource, normalizedMovie));
    bySourceMap.set(source, sourceMap);

    if (normalizedYear !== null) {
      const yearMap = byYearMap.get(normalizedYear) || new Map();
      const existingByYear = yearMap.get(key);
      yearMap.set(key, chooseBestRecord(existingByYear, normalizedMovie));
      byYearMap.set(normalizedYear, yearMap);
    }
  });

  const uniqueMovies = Array.from(overallMap.values());
  const sourceGroups = Array.from(bySourceMap.entries()).map(([source, map]) => ({
    source,
    movies: Array.from(map.values()),
  }));

  const movieCount = uniqueMovies.length;
  const totalGross = uniqueMovies.reduce((sum, movie) => sum + movie.totalGross, 0);

  const sourceBoxPlot = sourceGroups
    .map(({ source, movies }) => ({
      source,
      count: movies.length,
      stats: calculateFiveNumber(movies.map((movie) => movie.totalGross)),
    }))
    .filter((entry) => entry.stats !== null);

  const yearBoxPlot = Array.from(byYearMap.entries())
    .map(([year, map]) => {
      const movies = Array.from(map.values());
      return {
        year,
        count: movies.length,
        stats: calculateFiveNumber(movies.map((movie) => movie.totalGross)),
      };
    })
    .filter((entry) => entry.stats !== null)
    .sort((a, b) => a.year - b.year);

  const overallBoxPlot = calculateFiveNumber(uniqueMovies.map((row) => row.totalGross));

  const sourceGross = sourceGroups
    .map(({ source, movies }) => ({
      source,
      totalGross: movies.reduce((sum, movie) => sum + movie.totalGross, 0),
      count: movies.length,
    }))
    .sort((a, b) => b.totalGross - a.totalGross);

  const yearlyGrossMap = uniqueMovies.reduce((acc, movie) => {
    const yearKey = toValidYear(movie.year);
    if (yearKey === null) return acc;

    if (!acc.has(yearKey)) {
      acc.set(yearKey, { year: yearKey, totalGross: 0, count: 0 });
    }
    const aggregate = acc.get(yearKey);
    aggregate.totalGross += movie.totalGross;
    aggregate.count += 1;
    return acc;
  }, new Map());

  const yearlyGross = Array.from(yearlyGrossMap.values()).sort((a, b) => a.year - b.year);

  const peakYear = yearlyGross.reduce(
    (max, entry) => (entry.totalGross > max.totalGross ? entry : max),
    { year: null, totalGross: 0, count: 0 }
  );

  const topMovies = [...uniqueMovies]
    .sort((a, b) => b.totalGross - a.totalGross)
    .slice(0, 50)
    .map((movie) => ({
      title: movie.title || 'Без названия',
      source: movie.source || 'Неизвестно',
      year: movie.year || '—',
      totalGross: Number(movie.totalGross) || 0,
    }));

  return {
    totals: {
      movieCount,
      totalGross,
      latestScrape,
    },
    sourceGross,
    yearlyGross,
    peakYear,
    topMovies,
    boxPlot: {
      overall: overallBoxPlot,
      bySource: sourceBoxPlot,
      byYear: yearBoxPlot,
    },
  };
}

app.get('/api/metrics', async (_req, res) => {
  try {
    const metrics = await buildDashboardMetrics();
    res.json(metrics);
  } catch (error) {
    console.error('Ошибка построения метрик:', error);
    res.status(500).json({ message: 'Не удалось загрузить метрики', details: error.message });
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Подключение к базе данных установлено.');
    app.listen(PORT, () => {
      console.log(`Сервер запущен: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('Не удалось подключиться к базе данных:', error.message);
    process.exit(1);
  }
}

if (require.main === module) {
  start();
}

module.exports = { app, buildDashboardMetrics };