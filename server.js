const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Enhanced polyfills and client-side request interceptors for legacy WebKit
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

  // Intercept relative fetch() calls so dynamic site data loads through the proxy
  const originalFetch = window.fetch;
  window.fetch = function(resource, init) {
    let targetUrl = typeof resource === 'string' ? resource : resource.url;
    if (targetUrl && !targetUrl.startsWith('http') && !targetUrl.startsWith('/proxy')) {
      const absoluteUrl = new URL(targetUrl, window.location.href).href;
      // Extract the original target URL from our current proxy query string if possible
      const urlParams = new URLSearchParams(window.location.search);
      const currentProxyTarget = urlParams.get('url');
      if (currentProxyTarget) {
        const resolved = new URL(targetUrl, currentProxyTarget).href;
        arguments[0] = '/proxy?url=' + encodeURIComponent(resolved);
      }
    }
    return originalFetch.apply(this, arguments);
  };
</script>
`;

// Helper: Fix relative URLs and forms inside rewritten HTML
function rewriteUrls($, targetHost, targetProtocol) {
  const baseUrl = `${targetProtocol}//${targetHost}`;

  // Rewrite links, scripts, images, videos, and form submission actions
  $('a[href], link[href], script[src], img[src], video[src], source[src], form[action]').each((_, el) => {
    const attr = el.attribs.href ? 'href' : (el.attribs.src ? 'src' : 'action');
    let val = el.attribs[attr];

    if (val && !val.startsWith('data:') && !val.startsWith('javascript:') && !val.startsWith('#')) {
      try {
        const absoluteUrl = new url.URL(val, baseUrl).href;
        el.attribs[attr] = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      } catch (e) {
        // Skip invalid URLs
      }
    }
  });

  // Strip type="module" tags so legacy browsers fall back safely
  $('script[type="module"]').removeAttr('type');
}

// Proxy endpoint supporting both GET and POST requests (crucial for search forms)
app.all('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing "url" query parameter. Usage: /proxy?url=https://example.com');
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
        'Accept-Encoding': 'identity'
      },
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';

    // If HTML: inject polyfills and rewrite links/forms
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

    // Pass media/assets back directly
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

// UI Home Page
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>iOS 12 Compatibility Proxy</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; }
        input[type="text"] { width: 100%; padding: 10px; margin: 10px 0; box-sizing: border-box; font-size: 16px; }
        button { width: 100%; padding: 12px; background: #007aff; color: white; border: none; font-size: 16px; border-radius: 8px; }
      </style>
    </head>
    <body>
      <h2>iOS 12 Web Proxy</h2>
      <form action="/proxy" method="get">
        <label>Enter Web Page URL:</label>
        <input type="text" name="url" placeholder="https://example.com" required>
        <button type="submit">Browse via Proxy</button>
      </form>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`iOS 12 WebKit Proxy running on port ${PORT}`);
});
