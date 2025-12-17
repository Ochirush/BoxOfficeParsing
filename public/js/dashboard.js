const currency = (value) => '$' + Number(value || 0).toLocaleString('en-US');

const alertBox = document.getElementById('alertBox');
let sourceChart = null;
let trendChart = null;
let boxPlotChart = null;

const boxPlotPlugin = {
  id: 'boxPlotWhiskers',
  afterDatasetDraw(chart, args) {
    
    if (chart.config.type !== 'bar' || args.index !== 0) return;

    const y = chart.scales?.y;
    if (!y || typeof y.getPixelForValue !== 'function') return;

    const meta = args.meta;
    if (!meta || !Array.isArray(meta.data)) return;

    const ctx = chart.ctx;

    ctx.save();

    meta.data.forEach((bar) => {
      const raw = bar?.$context?.raw;
      if (!raw) return;

      const centerX = bar.x;
      const whiskerHalfWidth = Math.min(18, (bar.width || 20) * 0.45);

      const yMin = y.getPixelForValue(raw.min);
      const yMax = y.getPixelForValue(raw.max);
      const yMedian = y.getPixelForValue(raw.median);

      const q1Val = raw.base ?? raw.q1;
      const q3Val = raw.y ?? raw.q3;

      const yQ1 = y.getPixelForValue(q1Val);
      const yQ3 = y.getPixelForValue(q3Val);

      ctx.strokeStyle = '#e9edf2';
      ctx.lineWidth = 2;

      
      ctx.beginPath();
      ctx.moveTo(centerX, yMin);
      ctx.lineTo(centerX, yMax);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(centerX - whiskerHalfWidth, yMin);
      ctx.lineTo(centerX + whiskerHalfWidth, yMin);
      ctx.moveTo(centerX - whiskerHalfWidth, yMax);
      ctx.lineTo(centerX + whiskerHalfWidth, yMax);
      ctx.stroke();

 
      ctx.beginPath();
      ctx.moveTo(centerX - whiskerHalfWidth, yMedian);
      ctx.lineTo(centerX + whiskerHalfWidth, yMedian);
      ctx.stroke();


      ctx.beginPath();
      ctx.rect(
        centerX - whiskerHalfWidth,
        Math.min(yQ1, yQ3),
        whiskerHalfWidth * 2,
        Math.abs(yQ3 - yQ1)
      );
      ctx.stroke();
    });

    ctx.restore();
  },
};

Chart.register(boxPlotPlugin);

async function loadMetrics() {
  try {
    setAlert('Загружаем данные из базы…', 'info');
    const response = await fetch('/api/metrics');
    if (!response.ok) throw new Error('Не удалось получить метрики');

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
      ? restSources.reduce((sum, row) => sum + row.totalGross, 0) / restSources.length
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
  const { sourceGross, yearlyGross, totals, boxPlot } = metrics;

  if (sourceChart) sourceChart.destroy();
  if (trendChart) trendChart.destroy();
  if (boxPlotChart) boxPlotChart.destroy();

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
            label: (ctx) =>
              `${ctx.label}: ${currency(ctx.parsed)} (${Math.round(ctx.parsed / totals.totalGross * 100)}%)`
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


  const boxPlotData = Array.isArray(boxPlot?.byYear) ? boxPlot.byYear : [];

  if (boxPlotData.length > 0) {
    const sorted = [...boxPlotData].sort((a, b) => a.year - b.year);

    const labels = sorted.map((entry) => String(entry.year));
    const datasetData = sorted.map((entry) => ({
      x: String(entry.year),
      y: entry.stats.q3,
      base: entry.stats.q1,     
      q1: entry.stats.q1,
      q3: entry.stats.q3,
      min: entry.stats.min,
      max: entry.stats.max,
      median: entry.stats.median,
      count: entry.count,
    }));

    boxPlotChart = new Chart(document.getElementById('boxPlotChart'), {
      type: 'bar',
      data: {
        labels,
        datasets: [{
          label: 'IQR (Q1–Q3)',
          data: datasetData,
          backgroundColor: 'rgba(76, 201, 240, 0.35)',
          borderColor: '#4cc9f0',
          borderWidth: 1,
          hoverBackgroundColor: 'rgba(76, 201, 240, 0.55)',
        }],
      },
      options: {
        plugins: {
          legend: { labels: { color: '#e9edf2' } },
          tooltip: {
            callbacks: {
              label: (ctx) => {
                const value = ctx.raw;
                return [
                  `Год: ${ctx.label}`,
                  `Q1: ${currency(value.q1)}`,
                  `Медиана: ${currency(value.median)}`,
                  `Q3: ${currency(value.q3)}`,
                  `Мин: ${currency(value.min)}`,
                  `Макс: ${currency(value.max)}`,
                  `N: ${value.count}`,
                ];
              },
            },
          },
        },
        scales: {
          x: { ticks: { color: '#9fb3c8' }, grid: { display: false } },
          y: {
            ticks: {
              color: '#9fb3c8',
              callback: (value) => value >= 1_000_000 ? `$${(value / 1_000_000).toFixed(0)}M` : value,
            },
            grid: { color: 'rgba(255,255,255,0.05)' },
          },
        },
      },
    });
  }

  
  renderBoxSummary(boxPlot?.overall, totals.movieCount);
}

function renderBoxSummary(overallStats, count) {
  if (!overallStats) {
    ['boxMin', 'boxQ1', 'boxMedian', 'boxQ3', 'boxMax', 'boxCount'].forEach((id) => {
      document.getElementById(id).textContent = '—';
    });
    return;
  }

  document.getElementById('boxMin').textContent = currency(overallStats.min);
  document.getElementById('boxQ1').textContent = currency(overallStats.q1);
  document.getElementById('boxMedian').textContent = currency(overallStats.median);
  document.getElementById('boxQ3').textContent = currency(overallStats.q3);
  document.getElementById('boxMax').textContent = currency(overallStats.max);
  document.getElementById('boxCount').textContent = count || 0;
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

  unique.slice(0, 5).forEach((movie) => {
    const cleanSource = (movie.source || 'Неизвестно')
      .replace(/\s*-\s*Detailed\s*$/i, '');

    const item = document.createElement('li');
    item.textContent = `${movie.title} (${movie.year}) · ${cleanSource} · ${currency(movie.totalGross)}`;
    list.appendChild(item);
  });
}

document.addEventListener('DOMContentLoaded', loadMetrics);
