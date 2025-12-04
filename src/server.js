const path = require('path');
const express = require('express');
const { Op, fn, col, literal } = require('sequelize');
const sequelize = require('./db/connection');
const Movie = require('./db/models/Movie');

const app = express();
const PORT = process.env.PORT || 3000;

async function buildDashboardMetrics() {
  const movieCount = await Movie.count();
  const totalGross = Number(await Movie.sum('total_gross')) || 0;
  const latestScrape = await Movie.max('scrapedAt');

  const sourceGrossRaw = await Movie.findAll({
    attributes: [
      'source',
      [fn('SUM', col('total_gross')), 'totalGross'],
      [fn('COUNT', col('id')), 'count'],
    ],
    group: ['source'],
    order: [[literal('"totalGross"'), 'DESC']],
    raw: true,
  });

  const sourceGross = sourceGrossRaw.map((row) => ({
    source: row.source || 'Неизвестно',
    totalGross: Number(row.totalGross) || 0,
    count: Number(row.count) || 0,
  }));

  const yearlyGrossRaw = await Movie.findAll({
    attributes: [
      'year',
      [fn('SUM', col('total_gross')), 'totalGross'],
      [fn('COUNT', col('id')), 'count'],
    ],
    where: { year: { [Op.ne]: null } },
    group: ['year'],
    order: [['year', 'ASC']],
    raw: true,
  });

  const yearlyGross = yearlyGrossRaw
    .filter((row) => row.year !== null)
    .map((row) => ({
      year: Number(row.year),
      totalGross: Number(row.totalGross) || 0,
      count: Number(row.count) || 0,
    }));

  const peakYear = yearlyGross.reduce(
    (max, entry) => (entry.totalGross > max.totalGross ? entry : max),
    { year: null, totalGross: 0, count: 0 }
  );

  const topMoviesRaw = await Movie.findAll({
  attributes: ['title', 'source', 'year', 'totalGross'],
  order: [[col('total_gross'), 'DESC']],
  limit: 50,          
  raw: true,
});

  const topMovies = topMoviesRaw.map((movie) => ({
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