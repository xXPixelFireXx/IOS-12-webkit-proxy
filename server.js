const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const url = require('url');

const app = express();
const PORT = process.env.PORT || 3000;

// Polyfill scripts injected into every HTML page for iOS 12 WebKit compatibility
const POLYFILL_INJECTION = `
<script src="https://cdnjs.cloudflare.com/ajax/libs/core-js/3.32.0/minified.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/fetch/3.6.20/fetch.umd.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/webcomponentsjs/2.8.0/webcomponents-bundle.js"></script>
<script>
  // Global polyfill patches for legacy WebKit
  if (!window.globalThis) window.globalThis = window;
  if (!String.prototype.replaceAll) {
    String.prototype.replaceAll = function(str, newStr) {
      return this.split(str).join(newStr);
    };
  }
</script>
`;

// Helper: Fix relative URLs inside rewritten HTML
function rewriteUrls($, targetHost, targetProtocol) {
  const baseUrl = `${targetProtocol}//${targetHost}`;

  $('a[href], link[href], script[src], img[src], video[src], source[src]').each((_, el) => {
    const attr = el.attribs.href ? 'href' : 'src';
    let val = el.attribs[attr];

    if (val && !val.startsWith('data:') && !val.startsWith('javascript:')) {
      try {
        const absoluteUrl = new url.URL(val, baseUrl).href;
        // Proxy external assets through our proxy endpoint
        el.attribs[attr] = `/proxy?url=${encodeURIComponent(absoluteUrl)}`;
      } catch (e) {
        // Skip invalid URLs
      }
    }
  });

  // Strip type="module" tags so legacy browsers attempt parsing fallback scripts
  $('script[type="module"]').removeAttr('type');
}

// Proxy endpoint
app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send('Missing "url" query parameter. Usage: /proxy?url=https://example.com');
  }

  try {
    const parsedTarget = new url.URL(targetUrl);

    // Request target page with modern User-Agent or custom client headers
    const response = await axios({
      method: 'get',
      url: targetUrl,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': req.headers['accept'] || '*/*',
        'Accept-Encoding': 'identity' // Prevent gzipped raw streams when modifying DOM
      },
      responseType: 'arraybuffer',
      validateStatus: () => true
    });

    const contentType = response.headers['content-type'] || '';

    // If HTML: inject polyfills and rewrite links
    if (contentType.includes('text/html')) {
      const htmlString = response.data.toString('utf-8');
      const $ = cheerio.load(htmlString);

      // Inject core polyfills into the <head>
      if ($('head').length) {
        $('head').prepend(POLYFILL_INJECTION);
      } else {
        $.root().prepend(POLYFILL_INJECTION);
      }

      // Rewrite inline links and media sources to route back through this proxy
      rewriteUrls($, parsedTarget.host, parsedTarget.protocol);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.send($.html());
    }

    // Pass media/video content directly back with streaming support
    Object.keys(response.headers).forEach((key) => {
      // Omit restrictive security headers that block legacy WebKit
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

// UI helper page for entering target website URLs directly from iPad browser
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
