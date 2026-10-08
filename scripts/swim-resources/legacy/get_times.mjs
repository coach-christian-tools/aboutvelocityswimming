import { chromium } from 'playwright';
(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  const page = await context.newPage();
  await page.goto('https://www.swimcloud.com/swimmer/2415481/times/', { waitUntil: 'domcontentloaded' });
  try {
    await page.waitForSelector('table tbody tr', { timeout: 15000 });
  } catch {
    console.log("No table found or Cloudflare blocked.");
  }
  const html = await page.content();
  console.log(html.includes("table") ? "Table found!" : "Still Cloudflare challenge.");
  await browser.close();
})();
