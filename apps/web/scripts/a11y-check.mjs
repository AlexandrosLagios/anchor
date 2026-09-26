/**
 * WCAG 2.1 AA gate for the public Anchor site.
 * Expects a running server (dev or preview) at BASE_URL (default http://127.0.0.1:4321).
 *
 * Usage: node apps/web/scripts/a11y-check.mjs
 *        BASE_URL=http://127.0.0.1:4321 node apps/web/scripts/a11y-check.mjs
 */
import { createRequire } from 'node:module';
import { chromium } from 'playwright';

const require = createRequire(import.meta.url);
const axeSource = require('axe-core').source;

const BASE = process.env.BASE_URL || 'http://127.0.0.1:4321';
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];
const ROUTES = [
  '/',
  '/how-it-works',
  '/app',
  '/family',
  '/my-data',
  '/privacy',
  '/terms',
  '/cookies',
  '/sitemap',
  '/404',
];

async function runAxe(page) {
  await page.evaluate(axeSource);
  return page.evaluate(async (tags) => {
    const results = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: tags } });
    return {
      violations: results.violations.map((v) => ({
        id: v.id,
        impact: v.impact,
        help: v.help,
        nodes: v.nodes.length,
        targets: v.nodes.slice(0, 5).map((n) => n.target),
      })),
    };
  }, TAGS);
}

async function dismissConsent(page) {
  const accept = page.locator('.consent-banner .btn-primary');
  if (await accept.count()) {
    await accept.click();
    try {
      await page.waitForSelector('.consent-banner', { state: 'detached', timeout: 3000 });
    } catch {
      // Banner may already be gone.
    }
  }
}

async function clearConsent(page) {
  await page.addInitScript(() => {
    try {
      localStorage.removeItem('anchor-consent-v1');
    } catch {
      // Private mode or blocked storage.
    }
  });
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const failures = [];

  for (const route of ROUTES) {
    const url = `${BASE}${route === '/404' ? '/this-page-does-not-exist-a11y' : route}`;

    // Consent banner open
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await clearConsent(page);
      const response = await page.goto(url, { waitUntil: 'load' });
      if (!response || response.status() >= 500) {
        failures.push({ route, mode: 'consent-open', error: `HTTP ${response?.status()}` });
        await context.close();
        continue;
      }
      await page.waitForTimeout(500);
      const { violations } = await runAxe(page);
      if (violations.length) {
        failures.push({ route, mode: 'consent-open', violations });
      }
      await context.close();
    }

    // Consent dismissed
    {
      const context = await browser.newContext();
      const page = await context.newPage();
      await clearConsent(page);
      await page.goto(url, { waitUntil: 'load' });
      await page.waitForTimeout(500);
      await dismissConsent(page);
      const { violations } = await runAxe(page);
      if (violations.length) {
        failures.push({ route, mode: 'consent-dismissed', violations });
      }
      await context.close();
    }
  }

  await browser.close();

  if (failures.length) {
    console.error('axe WCAG 2.1 AA failures:\n');
    for (const fail of failures) {
      console.error(`- ${fail.route} (${fail.mode})`);
      if (fail.error) console.error(`  ${fail.error}`);
      for (const v of fail.violations || []) {
        console.error(`  ${v.id} [${v.impact}] ${v.help} (${v.nodes} nodes)`);
        for (const t of v.targets) console.error(`    ${JSON.stringify(t)}`);
      }
    }
    process.exit(1);
  }

  console.log(`axe WCAG 2.1 AA: ${ROUTES.length} routes × 2 consent states — 0 violations`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
