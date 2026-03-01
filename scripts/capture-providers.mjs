import { chromium } from 'playwright';
import fs from 'fs';
(async () => {
  const url = process.env.URL || 'http://localhost:5173/';
  const out = 'runs/screenshots';
  fs.mkdirSync(out, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('PAGE:', msg.text()));
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  // Wait for the app to hydrate / HMR to connect
  await page.waitForSelector('body', { timeout: 60000 });
  await page.waitForTimeout(1500);

  // Try to open Settings via common menu patterns
  const settingsSelectors = [
    'a[href="/settings"]',
    'a[href="#/settings"]',
    'a:has-text("Settings")',
    'button:has-text("Settings")',
    'nav >> text=Settings',
  ];
  let settingsFound = false;
  for (const sel of settingsSelectors) {
    try {
      const el = await page.$(sel);
      if (el) {
        console.log('Clicking settings selector:', sel);
        await el.click();
        settingsFound = true;
        await page.waitForLoadState('networkidle');
        break;
      }
    } catch (e) {}
  }

  // If not found, try opening a common settings route
  if (!settingsFound) {
    const tryUrls = [
      '/settings',
      '/#/settings',
      '/settings/providers',
      '/#/settings/providers',
      '/providers',
    ];
    for (const u of tryUrls) {
      try {
        console.log('Trying route', url.replace(/\/$/, '') + u);
        await page.goto(url.replace(/\/$/, '') + u, { waitUntil: 'networkidle' });
        // crude check for provider text
        const text = await page.content();
        if (/provider/i.test(text) || /opencode/i.test(text) || /openhei/i.test(text)) {
          break;
        }
      } catch (e) {}
    }
  }

  // Wait briefly for UI hydration
  await page.waitForTimeout(1000);

  // Screenshot #1: provider list (whole page)
  const path1 = `${out}/providers-list.png`;
  await page.screenshot({ path: path1, fullPage: true });
  console.log('Saved', path1);

  // Try to click a provider named "OpenCode" / "OpenCode Go" / "OpenCode local" or similar
  const providerNames = ['OpenCode Go', 'OpenCode local', 'OpenCode', 'OpenCode Local', 'Opencode Go', 'Opencode', 'OpenHei'];
  for (const name of providerNames) {
    const btn = await page.$(`text="${name}"`);
    if (btn) {
      console.log('Found provider label:', name);
      await btn.click().catch(() => {});
      await page.waitForTimeout(500);
      break;
    }
  }

  // Screenshot #2: after selection
  const path2 = `${out}/providers-after-select.png`;
  await page.screenshot({ path: path2, fullPage: true });
  console.log('Saved', path2);

  await browser.close();
})();
