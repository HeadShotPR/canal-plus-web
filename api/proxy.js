// api/proxy.js - High-Performance Streaming Proxy for Smart TV & Web Player
import { Readable } from 'stream';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges, Location');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  const { url } = req.query;
  if (!url) {
    return res.status(400).json({ error: 'Missing url parameter' });
  }

  try {
    const decodedUrl = decodeURIComponent(url);

    const forwardHeaders = {
      'User-Agent': 'IPTVSmartersPro/3.1.5.1 (Android)',
      'Accept': '*/*'
    };
    if (req.headers.range) {
      forwardHeaders['Range'] = req.headers.range;
    }

    // UNIFIED REDIRECT PIPELINE FOR LIVE, MOVIES, AND SERIES:
    // Resolves the 302 redirect directly from the master Xtream Codes server (plus.lat)
    // and sends the browser/Smart TV directly to the media delivery node.
    // 1. Avoids 403 Forbidden caused by datacenter firewall IP blocking.
    // 2. Plays directly using the user's home/residential IP.
    // 3. No 50MB Vercel serverless payload limits or 10s execution timeouts.
    const isStream = decodedUrl.includes('/live/') ||
                     decodedUrl.includes('/movie/') ||
                     decodedUrl.includes('/series/') ||
                     decodedUrl.includes('.m3u8') ||
                     decodedUrl.includes('.mp4') ||
                     decodedUrl.includes('.mkv') ||
                     decodedUrl.includes('.ts');

    if (isStream) {
      try {
        const initRes = await fetch(decodedUrl, {
          headers: forwardHeaders,
          redirect: 'manual'
        });

        if (initRes.status >= 300 && initRes.status < 400 && initRes.headers.get('location')) {
          let cdnLocation = initRes.headers.get('location');

          // If relative redirect, make absolute
          if (!cdnLocation.startsWith('http://') && !cdnLocation.startsWith('https://')) {
            cdnLocation = new URL(cdnLocation, decodedUrl).href;
          }

          // For CDN nodes with valid HTTPS certificates (like sdef4.site), convert to HTTPS
          if (cdnLocation.includes('sdef4.site')) {
            cdnLocation = cdnLocation.replace('http://', 'https://').replace(':80/', '/');
          }

          res.setHeader('Location', cdnLocation);
          res.setHeader('Access-Control-Allow-Origin', '*');
          res.setHeader('Access-Control-Expose-Headers', 'Location');
          return res.status(302).end();
        }
      } catch (e) {
        // Fall back to standard pipeline if redirect failed
      }
    }

    // Manual redirect follower so headers are preserved
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

    // If M3U8 Playlist
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

    // JSON response
    if (contentType.includes('application/json') || currentUrl.includes('player_api.php') || decodedUrl.includes('player_api.php')) {
      const text = await targetRes.text();
      return res.status(targetRes.status).send(text);
    }

    // Stream video/binary
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
