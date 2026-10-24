const express = require('express');
const { firefox } = require('playwright');

const app = express();
const PORT = process.env.PORT || 3000;

let browserInstance = null;

async function getBrowser() {
  if (!browserInstance || !browserInstance.isConnected()) {
    browserInstance = await firefox.launch({
      headless: true,
      args: ['--no-sandbox']
    });
  }
  return browserInstance;
}

app.get('/proxy', async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send(`
      <h3>Missing "url" query parameter.</h3>
      <p>Usage: <a href="/proxy?url=https://example.com">/proxy?url=https://example.com</a></p>
      <p><a href="/">Back to Home</a></p>
    `);
  }

  let page = null;
  try {
    console.log(`Starting render for: ${targetUrl}`);
    const browser = await getBrowser();
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:109.0) Gecko/20100101 Firefox/115.0'
    });
    
    page = await context.newPage();

    // Changed from 'networkidle' to 'load' so it doesn't hang on background scripts
    await page.goto(targetUrl, { 
      waitUntil: 'load', 
      timeout: 25000 
    });

    const renderedHtml = await page.content();
    await page.close();
    await context.close();

    console.log(`Successfully rendered: ${targetUrl}`);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    return res.send(renderedHtml);

  } catch (err) {
    if (page) {
      await page.close().catch(() => {});
    }
    console.error('Firefox Render Error:', err.message);
    res.status(500).send(`
      <h3>Firefox Render Error</h3>
      <p>${err.message}</p>
      <p><a href="/">Back to Home</a></p>
    `);
  }
});

app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>IOS 12-B</title>
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <style>
        body { font-family: -apple-system, sans-serif; padding: 20px; max-width: 500px; margin: 0 auto; background: #f4f6f8; }
        .card { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        input[type="text"] { width: 100%; padding: 12px; margin: 10px 0; box-sizing: border-box; font-size: 16px; border: 1px solid #ccc; border-radius: 6px; }
        button { width: 100%; padding: 12px; background: #ff5722; color: white; border: none; font-size: 16px; border-radius: 6px; cursor: pointer; }
        button:hover { background: #e64a19; }
      </style>
    </head>
    <body>
      <div class="card">
        <h2>Firefox Headless Proxy</h2>
        <form action="/proxy" method="get">
          <label>Enter Web Page URL:</label>
          <input type="text" name="url" placeholder="https://www.google.com" required>
          <button type="submit">Render with Firefox</button>
        </form>
      </div>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Firefox Headless Proxy running on port ${PORT}`);
});
