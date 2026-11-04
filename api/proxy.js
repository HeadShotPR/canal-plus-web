// api/proxy.js - High-Performance Streaming Proxy for Smart TV & Web Player
import { Readable } from 'stream';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    // Forward range header if present for seeking/scrubbing
    const forwardHeaders = {
      'User-Agent': 'IPTVSmartersPro/3.1.5.1 (Android)',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      forwardHeaders['Range'] = req.headers.range;
    }

    // Manual redirect follower so headers (User-Agent, Range) are NEVER stripped across origins/protocols
    let currentUrl = decodedUrl;
    let targetRes;
    let redirects = 0;

    while (redirects < 5) {
      targetRes = await fetch(currentUrl, {
        headers: forwardHeaders,
        redirect: 'manual'
      });

      if (targetRes.status >= 300 && targetRes.status < 400 && targetRes.headers.get('location')) {
        const loc = targetRes.headers.get('location');
        currentUrl = new URL(loc, currentUrl).href;
        redirects++;
      } else {
        break;
      }
    }

    let contentType = targetRes.headers.get('content-type') || 'application/octet-stream';

    // Normalize video content types for browser compatibility
    if (currentUrl.includes('.mp4') || currentUrl.includes('/movie/') || currentUrl.includes('/series/')) {
      if (!contentType.includes('video/') && !contentType.includes('mpegurl')) {
        contentType = 'video/mp4';
      }
    } else if (currentUrl.includes('.m3u8')) {
      contentType = 'application/vnd.apple.mpegurl';
    } else if (currentUrl.includes('.ts')) {
      contentType = 'video/mp2t';
    }

    res.setHeader('Content-Type', contentType);
    res.setHeader('Accept-Ranges', 'bytes');

    if (targetRes.headers.get('content-range')) {
      res.setHeader('Content-Range', targetRes.headers.get('content-range'));
    }
    if (targetRes.headers.get('content-length')) {
      res.setHeader('Content-Length', targetRes.headers.get('content-length'));
    }

    // 1. If it's an HLS M3U8 Playlist, rewrite segment paths accurately using standard URL resolution
    if (currentUrl.includes('.m3u8') || decodedUrl.includes('.m3u8') || contentType.includes('mpegurl') || contentType.includes('application/x-mpegURL')) {
      const text = await targetRes.text();

      const rewritten = text.split('\n').map(line => {
        const trimmed = line.trim();
        if (trimmed && !trimmed.startsWith('#')) {
          let fullUrl = trimmed;
          if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
            fullUrl = new URL(trimmed, currentUrl).href;
          }
          return `/api/proxy?url=${encodeURIComponent(fullUrl)}`;
        }
        return line;
      }).join('\n');

      return res.status(targetRes.status).send(rewritten);
    }

    // 2. If it's a JSON response (Xtream Codes API)
    if (contentType.includes('application/json') || currentUrl.includes('player_api.php') || decodedUrl.includes('player_api.php')) {
      const text = await targetRes.text();
      return res.status(targetRes.status).send(text);
    }

    // 3. For video streams, TS chunks, and movie media, stream directly with pipe
    res.status(targetRes.status);
    if (targetRes.body) {
      const nodeStream = Readable.fromWeb(targetRes.body);
      nodeStream.on('error', (e) => {
        if (!res.headersSent) res.status(500).end();
      });
      res.on('close', () => {
        try { nodeStream.destroy(); } catch (e) {}
      });
      return nodeStream.pipe(res);
    } else {
      return res.end();
    }
  } catch (err) {
    if (!res.headersSent) {
      return res.status(500).json({ error: err.message || 'Proxy Error' });
    }
  }
}
