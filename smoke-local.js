const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('page: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push('console: ' + m.text());
  });
  const failed = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(r.status() + ' ' + r.url());
  });

  await page.goto('http://127.0.0.1:8787/', { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(5000);
  let ready = false;
  try {
    await page.getByText(/Ready/i).waitFor({ timeout: 20000 });
    ready = true;
  } catch {}
  const title = await page.title();
  const body = await page.evaluate(() => (document.body && document.body.innerText || '').slice(0, 500));
  await page.screenshot({ path: 'florr-site-download/reports/local-smoke.png', fullPage: true });
  console.log(JSON.stringify({ title, ready, body, errors: errors.slice(0, 20), failed: failed.slice(0, 40) }, null, 2));
  await browser.close();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
