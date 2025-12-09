const request = require('request');

const DEFAULT_SIZE_LIMIT = 15 * 1024 * 1024; 

function normalizeLimit(limit) {
  const n = Number(limit);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_SIZE_LIMIT;
}

async function fetchHtmlWithLimit(url, options = {}, sizeLimitBytes) {
  const limit = normalizeLimit(sizeLimitBytes);

  return new Promise((resolve, reject) => {
    let finished = false;
    const chunks = [];
    let receivedBytes = 0;

    const req = request({
      url,
      gzip: options.gzip ?? true,
      ...options,
    });

    const done = (err, html) => {
      if (finished) return;
      finished = true;
      if (err) reject(err);
      else resolve(html);
    };

    
    req.on('response', (res) => {
      if (res.statusCode >= 400) {
        req.abort();
        done(new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`));
      }
    });

    
    req.on('data', (chunk) => {
      if (finished) return;

      receivedBytes += chunk.length;

      if (receivedBytes > limit) {
        req.abort();
        done(new Error(`Response size exceeded limit of ${limit} bytes`));
        return;
      }

      chunks.push(chunk);
    });

    req.on('end', () => {
      if (finished) return;
      const html = Buffer.concat(chunks).toString('utf8');
      done(null, html);
    });

    req.on('error', (err) => done(err));
  });
}

module.exports = { fetchHtmlWithLimit, DEFAULT_SIZE_LIMIT };
