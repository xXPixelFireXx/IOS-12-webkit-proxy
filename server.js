const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Expanded polyfills and robust client-side interception
const POLYFILL_INJECTION = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/core-js/3.32.0/minified.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/fetch/3.6.20/fetch.umd.js"></script>
<script>
  if (!window.globalThis) window.globalThis = window;
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(str, newStr) {
      return this.split(str).join(newStr);
    };
  }

  // Intercept fetch to route dynamic API calls through proxy
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    let targetUrl = typeof resource === 'string' ? resource : resource.url;
    if (targetUrl && !targetUrl.startsWith('http') && !targetUrl.startsWith('/proxy')) {
      const urlParams = new URLSearchParams(window.location.search);
      const currentProxyTarget = urlParams.get('url');
      if (currentProxyTarget) {
        try {
          const resolved = new URL(targetUrl, currentProxyTarget).href;
          if (typeof resource === 'string') {
            arguments[0] = '/proxy?url=' + encodeURIComponent(resolved);
          } else {
            resource.url = '/proxy?url=' + encodeURIComponent(resolved);
          }
        } catch(e) {}
      }
    }
    return originalFetch.apply(this, arguments);
  };
</script>
`;

// Helper: Aggressively rewrite all possible URL-bearing attributes
function rewriteUrls($, targetHost, targetProtocol) {
  const baseUrl = `${targetProtocol}//${targetHost}`;

  // Target every attribute that could hold a URL or form action
  $('[href], [src], [action], [data-url], [data-src]').each((_, el) => {
    ['href', 'src', 'action', 'data-url', 'data-src'].forEach(attr => {
      const val = el.attribs[attr];
      if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#') && !val.startsWith('/proxy')) {
        try {
          const absoluteUrl = new url.URL(val, baseUrl).href;
          el.attribs[attr] = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
        } catch (e) {
          // Skip invalid URLs
        }
      }
    });
  });

  $('script[type="module"]').removeAttr('type');
}

// Proxy endpoint supporting GET and POST
app.all('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send(`
      <h3>Missing "url" query parameter.</h3>
      <p>Usage: <a href="/proxy?url=https://example.com">/proxy?url=https://example.com</a></p>
      <p><a href="/">Back to Home</a></p>
    `);
  }

  try {
    const parsedTarget = new url.URL(targetUrl);

    const response = await axios({
      method: req.method,
      url: targetUrl,
      data: req.body,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Encoding': 'identity',
        'Referer': `${parsedTarget.protocol}//${parsedTarget.host}/`
      },
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';

    // If HTML, parse and rewrite
    if (contentType.includes('text/html')) {
      const htmlString = response.data.toString('utf-8');
      const $ = cheerio.load(htmlString);

      if ($('head').length) {
        $('head').prepend(POLYFILL_INJECTION);
      } else {
        $.root().prepend(POLYFILL_INJECTION);
      }

      rewriteUrls($, parsedTarget.host, parsedTarget.protocol);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send($.html());
    }

    // Pass non-HTML assets straight through
    Object.keys(response.headers).forEach((key) => {
      if (!['content-security-policy', 'strict-transport-security', 'x-frame-options'].includes(key.toLowerCase())) {
        res.setHeader(key, response.headers[key]);
      }
    });

    res.status(response.status).send(response.data);

  } catch (err) {
    console.error('Proxy Error:', err.message);
    res.status(500).send(`Proxy Error: ${err.message}`);
  }
});

// Catch stray requests like /search and redirect them gracefully back to home or error message
app.use((req, res) => {
  res.status(404).send(`
    <h3>Proxy Route Not Found</h3>
    <p>You tried to access <code>${req.path}</code> directly on the server.</p>
    <p>Make sure your links use <code>/proxy?url=...</code></p>
    <p><a href="/">Go to Home</a></p>
  `);
});

// UI Home Page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>iOS 12 Compatibility Proxy</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; background: #f9f9f9; }
        input[type="text"] { width: 100%; padding: 12px; margin: 10px 0; box-sizing: border-box; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; }
        button { width: 100%; padding: 12px; background: #007aff; color: white; border: none; font-size: 16px; border-radius: 6px; cursor: pointer; }
        button:hover { background: #0056b3; }
      </style>
    </head>
    <body>
      <h2>iOS 12 Web Proxy</h2>
      <form action="/proxy" method="get">
        <label>Enter Web Page URL:</label>
        <input type="text" name="url" placeholder="https://html.duckduckgo.com" required>
        <button type="submit">Browse via Proxy</button>
      </form>
      <p style="font-size: 12px; color: #666; margin-top: 20px;">
        <em>Tip: Heavy web apps like YouTube or ABCmouse require features beyond simple HTML parsing. Try using lightweight or HTML-first sites (like DuckDuckGo HTML or Wikipedia) for the best results on iOS 12.</em>
      </p>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`iOS 12 WebKit Proxy running on port ${PORT}`);
});
