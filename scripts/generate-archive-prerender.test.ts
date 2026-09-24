import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const ARCHIVE_URL = 'https://uk-immigration-compass.vercel.app/updates/archive';
const SCRIPT_PATH = resolve(process.cwd(), 'scripts', 'generate-archive-prerender.mjs');
const BUILD_EPOCH_SECONDS = '1790211723';
const BUILD_TIMESTAMP = '2026-09-24T01:02:03.000Z';
const ORIGINAL_HOMEPAGE_LASTMOD = '2026-01-01';
const ORIGINAL_UNRELATED_LASTMOD = '2026-01-02';

const TEMPLATE = `<!doctype html>
<html lang="en-GB">
  <head>
    <title>Old title</title>
    <meta name="description" content="Old description" />
    <meta name="robots" content="index, follow" />
    <meta property="og:title" content="Old Open Graph title" />
    <meta property="og:description" content="Old Open Graph description" />
    <meta property="og:url" content="https://uk-immigration-compass.vercel.app/" />
    <meta name="twitter:title" content="Old Twitter title" />
    <meta name="twitter:description" content="Old Twitter description" />
    <meta name="twitter:url" content="https://uk-immigration-compass.vercel.app/" />
    <link rel="canonical" href="https://uk-immigration-compass.vercel.app/" />
    <script type="application/ld+json">{"@type":"FAQPage","mainEntity":[]}</script>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/js/app.js"></script>
  </body>
</html>`;

const SITEMAP = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://uk-immigration-compass.vercel.app/</loc>
    <lastmod>${ORIGINAL_HOMEPAGE_LASTMOD}</lastmod>
  </url>
  <url>
    <loc>${ARCHIVE_URL}</loc>
    <lastmod>${ORIGINAL_HOMEPAGE_LASTMOD}</lastmod>
  </url>
  <url>
    <loc>https://uk-immigration-compass.vercel.app/other-page</loc>
    <lastmod>${ORIGINAL_UNRELATED_LASTMOD}</lastmod>
  </url>
</urlset>`;

const FUTURE_EVENT_MS = Date.parse('2027-12-15T00:00:00.000Z');
const OLDER_EVENT_MS = Date.parse('2026-09-19T12:00:00.000Z');
const FUTURE_METADATA_EVENT_MS = Date.parse('2026-09-18T12:00:00.000Z');

const FIXTURE_ITEMS = [
  {
    id: 'future-event',
    title: 'Future event </script><script>alert("title")</script> & more',
    status: 'Passed',
    date: '15 December 2027',
    parsedDate: FUTURE_EVENT_MS,
    category: 'Work',
    summary: 'Summary </script><script>alert("summary")</script> & more',
    sourceUrl: 'javascript:alert(1)',
    createdAt: '2026-09-23T12:00:00.000Z',
    updatedAt: '2026-09-23T12:00:00.000Z',
  },
  {
    id: 'older-event',
    title: 'Older event',
    status: 'Active',
    date: '19 September 2026',
    parsedDate: OLDER_EVENT_MS,
    category: 'General',
    summary: 'Older summary',
    sourceUrl: 'https://www.gov.uk/test-update',
    createdAt: '2026-09-22T12:00:00.000Z',
    updatedAt: '2026-09-22T12:00:01.000Z',
  },
  {
    id: 'future-metadata-event',
    title: 'Future source metadata event',
    status: 'Active',
    date: '18 September 2026',
    parsedDate: FUTURE_METADATA_EVENT_MS,
    category: 'General',
    summary: 'Future source metadata summary',
    sourceUrl: '',
    createdAt: '2026-09-25T12:00:00.000Z',
    updatedAt: '2026-09-25T12:00:01.000Z',
  },
  {
    id: 'fallback-event',
    title: 'Deterministic fallback event',
    status: 'Discussion',
    date: 'not a calendar date',
    parsedDate: 'not-a-number',
    category: 'General',
    summary: 'Fallback summary',
    sourceUrl: '',
    createdAt: '2026-09-18T12:00:00.000Z',
    updatedAt: '2026-09-18T12:00:00.000Z',
  },
];

interface GeneratedFiles {
  html: string;
  sitemap: string;
}

function runGenerator(
  distDir: string,
  sourceUrl: string,
  sourceDateEpoch: string | null = BUILD_EPOCH_SECONDS
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolvePromise, rejectPromise) => {
    const env = { ...process.env };
    delete env.ARCHIVE_PRERENDER_TIMESTAMP;
    delete env.SOURCE_DATE_EPOCH;
    if (sourceDateEpoch !== null) env.SOURCE_DATE_EPOCH = sourceDateEpoch;

    const child = spawn(process.execPath, [SCRIPT_PATH], {
      cwd: process.cwd(),
      env: {
        ...env,
        ARCHIVE_PRERENDER_DIST_DIR: distDir,
        ARCHIVE_SOURCE_URL: sourceUrl,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    const timer = setTimeout(() => {
      if (settled) return;
      child.kill();
      settled = true;
      rejectPromise(new Error(`Generator timed out. stdout: ${stdout} stderr: ${stderr}`));
    }, 15_000);

    child.stdout?.on('data', chunk => {
      stdout += String(chunk);
    });
    child.stderr?.on('data', chunk => {
      stderr += String(chunk);
    });
    child.on('error', error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      rejectPromise(error);
    });
    child.on('close', code => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (code === 0) resolvePromise({ stdout, stderr });
      else rejectPromise(new Error(`Generator exited ${code}. stdout: ${stdout} stderr: ${stderr}`));
    });
  });
}

async function createFixture(root: string, name: string): Promise<string> {
  const distDir = join(root, name);
  await mkdir(distDir, { recursive: true });
  await writeFile(join(distDir, 'index.html'), TEMPLATE, 'utf8');
  await writeFile(join(distDir, 'sitemap.xml'), SITEMAP, 'utf8');
  return distDir;
}

async function readGenerated(distDir: string): Promise<GeneratedFiles> {
  return {
    html: await readFile(join(distDir, 'updates', 'archive', 'index.html'), 'utf8'),
    sitemap: await readFile(join(distDir, 'sitemap.xml'), 'utf8'),
  };
}

function lastmodFor(sitemap: string, url: string): string {
  const escapedUrl = url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = sitemap.match(new RegExp(`<loc>${escapedUrl}</loc>\\s*<lastmod>([^<]*)</lastmod>`));
  if (!match) throw new Error(`No lastmod found for ${url}`);
  return match[1];
}

function firstArticle(html: string): string {
  const match = html.match(/<article class="rounded-2xl[\s\S]*?<\/article>/);
  if (!match) throw new Error('No prerendered archive item found.');
  return match[0];
}

function articleContaining(html: string, text: string): string {
  const article = (html.match(/<article class="rounded-2xl[\s\S]*?<\/article>/g) || [])
    .find(candidate => candidate.includes(text));
  if (!article) throw new Error(`No prerendered archive item found for ${text}.`);
  return article;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function jsonLdFrom(html: string): Record<string, any> {
  const match = html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/);
  if (!match) throw new Error('No JSON-LD found.');
  return JSON.parse(match[1]);
}

describe('archive prerender generator', () => {
  jest.setTimeout(30_000);

  it('uses a valid SOURCE_DATE_EPOCH and keeps generated metadata safe and aligned with the hydrated archive', async () => {
    const root = await mkdtemp(join(tmpdir(), 'uk-archive-prerender-'));
    const server = createServer((request, response) => {
      const pathname = new URL(request.url || '/', 'http://127.0.0.1').pathname;
      if (pathname === '/valid') {
        response.setHeader('content-type', 'application/json');
        response.end(JSON.stringify({ items: FIXTURE_ITEMS }));
        return;
      }
      if (pathname === '/malformed') {
        response.setHeader('content-type', 'application/json');
        response.end('{not valid json');
        return;
      }
      if (pathname === '/network') {
        request.socket.destroy();
        return;
      }
      response.statusCode = 404;
      response.end('not found');
    });

    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once('error', rejectPromise);
        server.listen(0, '127.0.0.1', () => resolvePromise());
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture server did not start.');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      const validDist = await createFixture(root, 'valid');
      await runGenerator(validDist, `${baseUrl}/valid`);
      const valid = await readGenerated(validDist);

      expect((valid.html.match(/<h1\b/gi) || []).length).toBe(1);
      expect(valid.html).not.toContain('FAQPage');
      expect(valid.html).not.toContain('Official source');
      expect(valid.html).toContain('>Source</a>');
      expect(valid.html).toContain('&lt;/script&gt;&lt;script&gt;');
      expect(valid.html).toContain('&amp;');
      expect(valid.html).not.toContain('javascript:alert(1)');
      expect(valid.html).toContain('href="https://www.gov.uk/test-update"');

      const first = firstArticle(valid.html);
      const hydratedFirst = [...FIXTURE_ITEMS].sort((left, right) => Number(right.parsedDate) - Number(left.parsedDate))[0];
      expect(first).toContain(escapeHtml(hydratedFirst.title));
      expect(first).toContain(escapeHtml(hydratedFirst.date));
      expect(first).toContain('Added to archive');
      expect(first).not.toContain('>Updated');

      const articleMatches = valid.html.match(/<article class="rounded-2xl[\s\S]*?<\/article>/g) || [];
      expect(articleMatches[1]).toContain('<time datetime="2026-09-22T12:00:01.000Z">Updated');

      const futureMetadataArticle = articleContaining(valid.html, 'Future source metadata event');
      expect(futureMetadataArticle).not.toContain('Added to archive');
      expect(futureMetadataArticle).not.toContain('Updated');
      expect(futureMetadataArticle).not.toContain('2026-09-25');

      const genuineUpdateArticle = articleContaining(valid.html, 'Older event');
      expect(genuineUpdateArticle).toContain('<time datetime="2026-09-22T12:00:01.000Z">Updated');
      expect(genuineUpdateArticle).not.toContain('Added to archive');

      const jsonLd = jsonLdFrom(valid.html);
      expect(jsonLd['@type']).toBe('CollectionPage');
      expect(jsonLd.mainEntity['@type']).toBe('ItemList');
      expect(jsonLd.mainEntity.numberOfItems).toBe(FIXTURE_ITEMS.length);
      expect(jsonLd.mainEntity.itemListElement[0].item.dateModified).toBeUndefined();
      expect(jsonLd.mainEntity.itemListElement[1].item.dateModified).toBe('2026-09-22T12:00:01.000Z');
      expect(jsonLd.mainEntity.itemListElement[0].item.headline).toBe(FIXTURE_ITEMS[0].title);
      expect(jsonLd.mainEntity.itemListElement[1].item.sameAs).toBe('https://www.gov.uk/test-update');

      const futureMetadata = jsonLd.mainEntity.itemListElement.find(
        (entry: Record<string, any>) => entry.item.headline === 'Future source metadata event'
      );
      expect(futureMetadata).toBeDefined();
      expect(futureMetadata?.item.datePublished).toBeUndefined();
      expect(futureMetadata?.item.dateModified).toBeUndefined();

      const genuineUpdate = jsonLd.mainEntity.itemListElement.find(
        (entry: Record<string, any>) => entry.item.headline === 'Older event'
      );
      expect(genuineUpdate?.item.datePublished).toBe('2026-09-22T12:00:00.000Z');
      expect(genuineUpdate?.item.dateModified).toBe('2026-09-22T12:00:01.000Z');

      expect(lastmodFor(valid.sitemap, ARCHIVE_URL)).toBe('2026-09-23T12:00:00.000Z');
      expect(valid.sitemap).not.toContain('2027');
      expect(lastmodFor(valid.sitemap, 'https://uk-immigration-compass.vercel.app/')).toBe(ORIGINAL_HOMEPAGE_LASTMOD);
      expect(lastmodFor(valid.sitemap, 'https://uk-immigration-compass.vercel.app/other-page')).toBe(ORIGINAL_UNRELATED_LASTMOD);

      for (const route of ['/malformed', '/network']) {
        const fallbackDist = await createFixture(root, route.slice(1));
        await runGenerator(fallbackDist, `${baseUrl}${route}`);
        const fallback = await readGenerated(fallbackDist);
        expect(fallback.html).toContain('No records are shown in this static snapshot.');
        expect(fallback.html).not.toContain('Latest updates</h2>\n        <div');
        expect(lastmodFor(fallback.sitemap, ARCHIVE_URL)).toBe(BUILD_TIMESTAMP);
        expect(lastmodFor(fallback.sitemap, 'https://uk-immigration-compass.vercel.app/')).toBe(ORIGINAL_HOMEPAGE_LASTMOD);
        expect(lastmodFor(fallback.sitemap, 'https://uk-immigration-compass.vercel.app/other-page')).toBe(ORIGINAL_UNRELATED_LASTMOD);
      }
    } finally {
      await new Promise<void>(resolvePromise => server.close(() => resolvePromise()));
      await rm(root, { recursive: true, force: true });
    }
  });

  it('rejects malformed SOURCE_DATE_EPOCH values and falls back to the current build time', async () => {
    const root = await mkdtemp(join(tmpdir(), 'uk-archive-prerender-invalid-epoch-'));
    const server = createServer((_request, response) => {
      response.statusCode = 503;
      response.end('unavailable');
    });
    const invalidValues = [
      '1.5',
      '0x10',
      '1e3',
      '-1',
      '+1',
      '   ',
      '8640000000001',
    ];

    try {
      await new Promise<void>((resolvePromise, rejectPromise) => {
        server.once('error', rejectPromise);
        server.listen(0, '127.0.0.1', () => resolvePromise());
      });
      const address = server.address();
      if (!address || typeof address === 'string') throw new Error('Fixture server did not start.');
      const baseUrl = `http://127.0.0.1:${address.port}`;

      for (const [index, sourceDateEpoch] of invalidValues.entries()) {
        const distDir = await createFixture(root, `invalid-${index}`);
        const startedAt = Date.now();
        const result = await runGenerator(distDir, baseUrl, sourceDateEpoch);
        const finishedAt = Date.now();
        const generated = await readGenerated(distDir);
        const lastmod = lastmodFor(generated.sitemap, ARCHIVE_URL);
        const lastmodMilliseconds = Date.parse(lastmod);

        expect(result.stderr).toContain('Ignoring invalid SOURCE_DATE_EPOCH:');
        expect(lastmod).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
        expect(lastmodMilliseconds).toBeGreaterThanOrEqual(startedAt);
        expect(lastmodMilliseconds).toBeLessThanOrEqual(finishedAt);
      }
    } finally {
      await new Promise<void>(resolvePromise => server.close(() => resolvePromise()));
      await rm(root, { recursive: true, force: true });
    }
  });
});
