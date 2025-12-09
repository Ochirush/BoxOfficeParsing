const currency = (value) => '$' + Number(value || 0).toLocaleString('en-US');

const alertBox = document.getElementById('alertBox');
let sourceChart = null;
let trendChart = null;

async function loadMetrics() { //подгрузка данных при перезугрузке страницы
  try {
    setAlert('Загружаем данные из базы…', 'info');
    const response = await fetch('/api/metrics');
    if (!response.ok) {
      throw new Error('Не удалось получить метрики');
    }
    const metrics = await response.json();
    setAlert('', '');
    renderOverview(metrics);
    renderCharts(metrics);
    renderTopMovies(metrics.topMovies);
  } catch (error) {
    console.error(error);
    setAlert('Не удалось загрузить данные: проверьте работу сервера и подключение к БД.', 'danger');
  }
}

function setAlert(message, variant) {
  if (!message) {
    alertBox.classList.add('d-none');
    alertBox.textContent = '';
    return;
  }

  alertBox.className = `alert alert-${variant}`;
  alertBox.textContent = message;
}

function renderOverview(metrics) {
  const { totals, sourceGross, peakYear } = metrics;
  document.getElementById('totalGross').textContent = currency(totals.totalGross || 0);
  document.getElementById('movieCount').textContent = `${totals.movieCount || 0} фильмов`;
  document.getElementById('lastScrape').textContent = totals.latestScrape
    ? `Дата последней выгрузки: ${new Date(totals.latestScrape).toLocaleString('ru-RU')}`
    : 'Дата последней выгрузки: —';

  if (sourceGross.length > 0) {
    const [topSource, ...restSources] = sourceGross;
    const average = restSources.length > 0
      ? restSources.reduce((sum, row) => sum + row.totalGross, 0) / sourceGross.length
      : topSource.totalGross;
    const delta = average ? Math.round(((topSource.totalGross - average) / average) * 100) : 0;
    document.getElementById('topSource').textContent = topSource.source;
    document.getElementById('topSourceGross').textContent = `${currency(topSource.totalGross)} сборов`;
    document.getElementById('topSourceDelta').textContent = `${delta >= 0 ? '+' : ''}${delta}% к среднему`;
  } else {
    document.getElementById('topSource').textContent = 'Нет данных';
    document.getElementById('topSourceGross').textContent = '—';
    document.getElementById('topSourceDelta').textContent = '0%';
  }

  if (peakYear && peakYear.year) {
    document.getElementById('peakMonth').textContent = peakYear.year;
    document.getElementById('peakMonthGross').textContent = `${currency(peakYear.totalGross)} — максимум по году`;
  } else {
    document.getElementById('peakMonth').textContent = 'Нет данных';
    document.getElementById('peakMonthGross').textContent = '—';
  }
}

function renderCharts(metrics) {
  const { sourceGross, yearlyGross, totals } = metrics;

  if (sourceChart) {
    sourceChart.destroy();
  }
  if (trendChart) {
    trendChart.destroy();
  }

  if (sourceGross.length === 0 || !totals.totalGross) {
    setAlert('В базе нет данных для построения диаграмм.', 'warning');
    return;
  }

  const genreColors = ['#4cc9f0', '#fca311', '#6c63ff', '#ef476f', '#06d6a0', '#f8961e', '#ffd166'];

  sourceChart = new Chart(document.getElementById('genreChart'), {
    type: 'doughnut',
    data: {
      labels: sourceGross.map((row) => row.source),
      datasets: [{
        data: sourceGross.map((row) => row.totalGross),
        backgroundColor: genreColors,
        borderWidth: 0,
        hoverOffset: 12
      }]
    },
    options: {
      plugins: {
        legend: { position: 'bottom', labels: { color: '#e9edf2' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.label}: ${currency(ctx.parsed)} (${Math.round(ctx.parsed / totals.totalGross * 100)}%)`
          }
        }
      }
    }
  });

  trendChart = new Chart(document.getElementById('trendChart'), {
    type: 'line',
    data: {
      labels: yearlyGross.map((row) => row.year),
      datasets: [{
        label: 'Годовые сборы',
        data: yearlyGross.map((row) => row.totalGross),
        tension: 0.35,
        borderColor: '#4cc9f0',
        backgroundColor: 'rgba(76, 201, 240, 0.15)',
        pointBackgroundColor: '#ffffff',
        pointBorderColor: '#4cc9f0',
        fill: true,
        borderWidth: 3
      }]
    },
    options: {
      scales: {
        x: { ticks: { color: '#9fb3c8' }, grid: { color: 'rgba(255,255,255,0.05)' } },
        y: {
          ticks: {
            color: '#9fb3c8',
            callback: (value) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(0)}M` : value
          },
          grid: { color: 'rgba(255,255,255,0.05)' }
        }
      },
      plugins: {
        legend: { labels: { color: '#e9edf2' } },
        tooltip: {
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${currency(ctx.parsed.y)}`
          }
        }
      }
    }
  });
}

function renderTopMovies(topMovies) {
  const list = document.getElementById('topMoviesList');
  list.innerHTML = '';

  if (!Array.isArray(topMovies) || topMovies.length === 0) {
    list.innerHTML = '<li>Нет данных для отображения.</li>';
    return;
  }

  const seen = new Set();
  const unique = [];

  for (const movie of topMovies) {
    const title = movie.title || 'Без названия';
    const year = movie.year || '—';
    const key = `${title}::${year}`;

    if (seen.has(key)) continue;
    seen.add(key);

    unique.push({ ...movie, title, year });
  }

  const top5 = unique.slice(0, 5);

  top5.forEach((movie) => {
    const cleanSource = (movie.source || 'Неизвестно')
      .replace(/\s*-\s*Detailed\s*$/i, '');

    const item = document.createElement('li');
    item.textContent =
      `${movie.title} (${movie.year}) · ${cleanSource} · ${currency(movie.totalGross)}`;
    list.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', loadMetrics);
