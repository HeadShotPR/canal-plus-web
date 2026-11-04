// api/test-movie.js - Test how Vercel reaches 162.251.62.117
import https from 'https';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  const user = 'wendermachado';
  const pass = '879988975';
  const streamId = req.query.id || '579302';
  const forwardHeaders = {
    'User-Agent': 'IPTVSmartersPro/3.1.5.1 (Android)',
    'Range': 'bytes=0-1024'
  };

  const results = {};

  try {
    const movieUrl = `https://plus.lat/movie/${user}/${pass}/${streamId}.mp4`;
    // Step 1: get redirect
    const r1 = await fetch(movieUrl, { headers: forwardHeaders, redirect: 'manual' });
    const loc = r1.headers.get('location');
    results.movieUrl = movieUrl;
    results.r1Status = r1.status;
    results.loc = loc ? loc.substring(0, 60) + '...' : null;

    if (loc) {
      // Step 2: fetch HTTP loc directly from Vercel
      try {
        const r2 = await fetch(loc, { headers: forwardHeaders });
        results.httpStatus = r2.status;
        results.httpRange = r2.headers.get('content-range');
        results.httpType = r2.headers.get('content-type');
        const text2 = await r2.text();
        results.httpBodyLen = text2.length;
        results.httpBodyPreview = text2.substring(0, 150);
      } catch (err2) {
        results.httpError = err2.message;
      }

      // Step 3: fetch HTTPS loc (port 443 with self-signed bypass)
      try {
        const u = new URL(loc);
        const httpsResult = await new Promise((resolve) => {
          const opt = {
            hostname: u.hostname,
            port: 443,
            path: u.pathname + u.search,
            method: 'GET',
            headers: forwardHeaders,
            rejectUnauthorized: false
          };
          const reqH = https.request(opt, (rH) => {
            let data = '';
            rH.on('data', chunk => { if (data.length < 200) data += chunk.toString(); });
            rH.on('end', () => {
              resolve({
                status: rH.statusCode,
                range: rH.headers['content-range'],
                type: rH.headers['content-type'],
                preview: data.substring(0, 100)
              });
            });
          });
          reqH.on('error', (e) => resolve({ error: e.message }));
          reqH.end();
        });
        results.httpsResult = httpsResult;
      } catch (err3) {
        results.httpsError = err3.message;
      }
    }

    return res.status(200).json(results);
  } catch (e) {
    return res.status(500).json({ error: e.message, results });
  }
}
