import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const SITE_URL = 'https://uk-immigration-compass.vercel.app';
export const ARCHIVE_PATH = '/updates/archive';
export const ARCHIVE_URL = `${SITE_URL}${ARCHIVE_PATH}`;
export const ARCHIVE_SOURCE_URL =
  process.env.ARCHIVE_SOURCE_URL || `${SITE_URL}/api/updates-archive`;
export const ARCHIVE_TITLE = 'UK Immigration Updates Archive';
export const VISIBLE_ARCHIVE_TITLE = 'Update Archive';
export const ARCHIVE_DESCRIPTION =
  'Search every UK immigration update from the past year: Home Office rule changes, visa news and parliamentary activity, organised by category.';

const MAX_ARCHIVE_ITEMS = 20;
const FETCH_TIMEOUT_MS = 8_000;
const DEFAULT_DIST_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'dist');

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanText(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}

function parseTimestamp(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const milliseconds = Date.parse(value);
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return { milliseconds, iso: date.toISOString() };
}

function parseDateOnly(value) {
  if (typeof value !== 'string') return null;
  const match = value.trim().match(/^(\d{4}-\d{2}-\d{2})(?:$|T|\s)/);
  if (!match) return null;
  return parseTimestamp(`${match[1]}T00:00:00.000Z`);
}

function parseNumericDate(value) {
  let milliseconds = NaN;
  if (typeof value === 'number') {
    milliseconds = value;
  } else if (typeof value === 'string' && value.trim()) {
    milliseconds = Number(value);
  }
  if (!Number.isFinite(milliseconds)) return null;
  const date = new Date(milliseconds);
  if (Number.isNaN(date.getTime())) return null;
  return parseTimestamp(date.toISOString());
}

function normaliseSourceUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.toString();
  } catch {
    return '';
  }
}

function hasLaterUpdate(updatedAt, createdAt) {
  return Boolean(
    updatedAt &&
      createdAt &&
      updatedAt.milliseconds > createdAt.milliseconds
  );
}

function compareArchiveItems(left, right) {
  const leftDate = left.orderingDate?.milliseconds;
  const rightDate = right.orderingDate?.milliseconds;
  if (leftDate == null && rightDate == null) return left.sourceOrder - right.sourceOrder;
  if (leftDate == null) return 1;
  if (rightDate == null) return -1;
  return rightDate - leftDate || left.sourceOrder - right.sourceOrder;
}

function normaliseItem(rawItem, sourceOrder, buildTimestamp) {
  if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return null;

  const title = cleanText(rawItem.title, 300);
  if (!title) return null;

  const sourceCreatedAt = parseTimestamp(rawItem.createdAt);
  const sourceUpdatedAt = parseTimestamp(rawItem.updatedAt);
  const buildMilliseconds = Date.parse(buildTimestamp);
  const createdAt =
    sourceCreatedAt && sourceCreatedAt.milliseconds <= buildMilliseconds
      ? sourceCreatedAt
      : null;
  const updatedAt =
    createdAt &&
    sourceUpdatedAt &&
    sourceUpdatedAt.milliseconds <= buildMilliseconds &&
    hasLaterUpdate(sourceUpdatedAt, createdAt)
      ? sourceUpdatedAt
      : null;
  const parsedDate = parseNumericDate(rawItem.parsedDate);
  const dateOnly = parseDateOnly(rawItem.date);
  const dateText = cleanText(rawItem.date, 180);
  const summary = cleanText(rawItem.summary, 1_200) || cleanText(rawItem.details, 1_200);
  const sourceUrl = normaliseSourceUrl(rawItem.sourceUrl);
  // parsedDate is the archive's event-ordering key and matches the hydrated
  // React route. If an upstream record is malformed, use an explicit ISO date
  // from `date`, then the source createdAt as a deterministic last resort.
  // Source order breaks all remaining ties so the first item cannot change on
  // hydration. The source createdAt is retained only for this ordering fallback;
  // archive metadata above is trusted only when it is no later than this build.
  const eventDate = parsedDate || dateOnly;
  const orderingDate = eventDate || sourceCreatedAt;

  return {
    title,
    dateText,
    category: cleanText(rawItem.category, 80),
    status: cleanText(rawItem.status, 80),
    summary,
    sourceUrl,
    createdAt,
    updatedAt,
    eventDate,
    orderingDate,
    sourceOrder,
  };
}

function normaliseItems(rawItems, buildTimestamp) {
  return rawItems
    .map((rawItem, sourceOrder) => normaliseItem(rawItem, sourceOrder, buildTimestamp))
    .filter(Boolean)
    .sort(compareArchiveItems);
}

function formatDate(timestamp) {
  if (!timestamp) return '';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(timestamp.milliseconds));
}

function newestArchiveFreshness(items, buildTimestamp) {
  const buildMilliseconds = Date.parse(buildTimestamp);
  let newest = null;

  for (const item of items) {
    if (!item.createdAt || item.createdAt.milliseconds > buildMilliseconds) continue;

    if (!newest || item.createdAt.milliseconds > newest.milliseconds) {
      newest = item.createdAt;
    }
    if (
      hasLaterUpdate(item.updatedAt, item.createdAt) &&
      item.updatedAt.milliseconds <= buildMilliseconds &&
      (!newest || item.updatedAt.milliseconds > newest.milliseconds)
    ) {
      newest = item.updatedAt;
    }
  }

  return newest ? newest.iso : null;
}

function renderItem(item) {
  const metadata = [];
  if (item.dateText) metadata.push(`<span>${escapeHtml(item.dateText)}</span>`);
  if (item.category) metadata.push(`<span>${escapeHtml(item.category)}</span>`);
  if (item.status) metadata.push(`<span>${escapeHtml(item.status)}</span>`);
  if (hasLaterUpdate(item.updatedAt, item.createdAt)) {
    metadata.push(
      `<time datetime="${escapeHtml(item.updatedAt.iso)}">Updated ${escapeHtml(formatDate(item.updatedAt))}</time>`
    );
  } else if (item.createdAt) {
    metadata.push(
      `<time datetime="${escapeHtml(item.createdAt.iso)}">Added to archive ${escapeHtml(formatDate(item.createdAt))}</time>`
    );
  }

  const source = item.sourceUrl
    ? `<a href="${escapeHtml(item.sourceUrl)}" target="_blank" rel="noopener noreferrer">Source</a>`
    : '';

  return `
      <article class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="flex flex-wrap gap-x-3 gap-y-1 text-sm text-slate-500">${metadata.join('')}</div>
        <h3 class="mt-3 text-xl font-bold text-slate-900">${escapeHtml(item.title)}</h3>
        ${item.summary ? `<p class="mt-2 text-slate-600">${escapeHtml(item.summary)}</p>` : ''}
        ${source ? `<p class="mt-3 text-sm font-semibold text-blue-700">${source}</p>` : ''}
      </article>`;
}

function renderArchiveBody(items) {
  const itemMarkup = items.length > 0
    ? `<section aria-labelledby="latest-updates-heading">
        <h2 id="latest-updates-heading" class="text-2xl font-bold text-slate-900">Latest updates</h2>
        <div class="mt-4 grid gap-4 md:grid-cols-2">${items.map(renderItem).join('')}</div>
      </section>`
    : `<section aria-labelledby="latest-updates-heading">
        <h2 id="latest-updates-heading" class="text-2xl font-bold text-slate-900">Latest updates</h2>
        <p class="mt-3 text-slate-600">The interactive archive will load the current records when JavaScript is available. No records are shown in this static snapshot.</p>
      </section>`;

  return `
    <main class="min-h-screen bg-slate-50 px-4 py-10 text-slate-900 sm:px-6">
      <article class="mx-auto max-w-5xl">
        <header class="rounded-3xl bg-slate-900 px-6 py-10 text-center text-white sm:px-10">
          <p class="text-sm font-semibold uppercase tracking-wider text-blue-200">UK Immigration Compass</p>
          <h1 class="mt-3 text-4xl font-extrabold">${escapeHtml(VISIBLE_ARCHIVE_TITLE)}</h1>
          <p class="mx-auto mt-4 max-w-2xl text-lg leading-relaxed text-slate-200">${escapeHtml(ARCHIVE_DESCRIPTION)}</p>
        </header>
        <div class="mt-8 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <h2 class="text-2xl font-bold text-slate-900">About this archive</h2>
          <p class="mt-3 leading-relaxed text-slate-600">This page brings together UK immigration changes from official sources. It is designed to help you find the latest Home Office rule changes, visa news and parliamentary activity in plain English, with dates and categories to make the archive easier to search.</p>
          <p class="mt-3 leading-relaxed text-slate-600">The live archive includes search, category filters and more records. The snapshot below is refreshed when this site is built. If the archive service is temporarily unavailable, this page still gives you a clear route back to the homepage.</p>
          <p class="mt-5"><a class="font-semibold text-blue-700 underline" href="/">Return to the UK Immigration Compass homepage</a></p>
        </div>
        <div class="mt-8">${itemMarkup}</div>
      </article>
    </main>`;
}

function jsonLdForItems(items) {
  const collectionPage = {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': ARCHIVE_URL,
    url: ARCHIVE_URL,
    name: VISIBLE_ARCHIVE_TITLE,
    description: ARCHIVE_DESCRIPTION,
    inLanguage: 'en-GB',
  };

  if (items.length > 0) {
    collectionPage.mainEntity = {
      '@type': 'ItemList',
      itemListOrder: 'https://schema.org/ItemListOrderDescending',
      numberOfItems: items.length,
      itemListElement: items.map((item, index) => {
        const article = {
          '@type': 'NewsArticle',
          headline: item.title,
        };
        if (item.createdAt) article.datePublished = item.createdAt.iso;
        if (hasLaterUpdate(item.updatedAt, item.createdAt)) {
          article.dateModified = item.updatedAt.iso;
        }
        if (item.summary) article.description = item.summary;
        if (item.sourceUrl) article.sameAs = item.sourceUrl;
        return {
          '@type': 'ListItem',
          position: index + 1,
          item: article,
        };
      }),
    };
  }

  return collectionPage;
}

function jsonForScript(value) {
  return JSON.stringify(value)
    .replace(/&/g, '\\u0026')
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function upsertMeta(html, kind, key, content) {
  const pattern = new RegExp(
    `<meta\\b(?=[^>]*\\b${kind}=["']${escapeRegExp(key)}["'])[^>]*>`,
    'i'
  );
  const tag = `<meta ${kind}="${key}" content="${escapeHtml(content)}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `${tag}\n  </head>`);
}

function upsertCanonical(html, url) {
  const pattern = /<link\b(?=[^>]*\brel=["']canonical["'])[^>]*>/i;
  const tag = `<link rel="canonical" href="${escapeHtml(url)}">`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `${tag}\n  </head>`);
}

function replaceTitle(html, title) {
  const pattern = /<title\b[^>]*>[\s\S]*?<\/title>/i;
  const tag = `<title>${escapeHtml(title)} | UK Immigration Compass</title>`;
  return pattern.test(html) ? html.replace(pattern, tag) : html.replace('</head>', `${tag}\n  </head>`);
}

function replaceJsonLd(html, value) {
  const pattern = /<script\b(?=[^>]*\btype=["']application\/ld\+json["'])[^>]*>[\s\S]*?<\/script>/gi;
  const tag = `<script type="application/ld+json">${jsonForScript(value)}</script>`;
  let replaced = false;
  const result = html.replace(pattern, () => {
    if (replaced) return '';
    replaced = true;
    return tag;
  });
  return replaced ? result : result.replace('</head>', `${tag}\n  </head>`);
}

// SIMPLIFIED: archive prerender content refreshes on deployment. Upgrade to runtime/edge generation if same-day freshness becomes necessary.
function buildArchiveHtml(template, items) {
  let html = template;
  html = replaceTitle(html, ARCHIVE_TITLE);
  html = upsertMeta(html, 'name', 'description', ARCHIVE_DESCRIPTION);
  html = upsertMeta(html, 'name', 'robots', 'index, follow');
  html = upsertMeta(html, 'property', 'og:title', `${ARCHIVE_TITLE} | UK Immigration Compass`);
  html = upsertMeta(html, 'property', 'og:description', ARCHIVE_DESCRIPTION);
  html = upsertMeta(html, 'property', 'og:url', ARCHIVE_URL);
  html = upsertMeta(html, 'name', 'twitter:title', `${ARCHIVE_TITLE} | UK Immigration Compass`);
  html = upsertMeta(html, 'name', 'twitter:description', ARCHIVE_DESCRIPTION);
  html = upsertMeta(html, 'name', 'twitter:url', ARCHIVE_URL);
  html = upsertCanonical(html, ARCHIVE_URL);
  html = replaceJsonLd(html, jsonLdForItems(items));

  const rootPattern = /<div\b[^>]*\bid=["']root["'][^>]*>\s*<\/div>/i;
  if (!rootPattern.test(html)) {
    throw new Error('Built index.html does not contain an empty root element.');
  }
  html = html.replace(rootPattern, `<div id="root" data-archive-prerender="true">\n${renderArchiveBody(items)}\n  </div>`);
  return `${html}\n`;
}

function updateArchiveLastmod(sitemap, date) {
  if (!date) return sitemap;
  const archiveUrlPattern = escapeRegExp(ARCHIVE_URL);
  const pattern = new RegExp(
    `(<url>\\s*<loc>\\s*${archiveUrlPattern}\\s*</loc>\\s*<lastmod>)([^<]*)(</lastmod>)`,
    'i'
  );
  if (!pattern.test(sitemap)) return sitemap;
  return sitemap.replace(pattern, (_match, before, _oldDate, after) => `${before}${escapeHtml(date)}${after}`);
}

function outputPaths(distDir) {
  const root = resolve(distDir);
  return {
    indexOutput: resolve(root, 'index.html'),
    archiveOutput: resolve(root, 'updates', 'archive', 'index.html'),
    sitemapOutput: resolve(root, 'sitemap.xml'),
  };
}

function parseBuildTimestamp() {
  const sourceDateEpoch = process.env.SOURCE_DATE_EPOCH;
  if (sourceDateEpoch !== undefined) {
    const seconds = /^\d+$/.test(sourceDateEpoch) ? Number(sourceDateEpoch) : NaN;
    const date = Number.isSafeInteger(seconds) ? new Date(seconds * 1_000) : null;
    if (date && Number.isFinite(date.getTime())) return date.toISOString();
    console.warn(`[archive-prerender] Ignoring invalid SOURCE_DATE_EPOCH: ${sourceDateEpoch}`);
  }

  return new Date().toISOString();
}

async function fetchArchiveItems(sourceUrl, fetchImpl) {
  const fetcher = fetchImpl || globalThis.fetch;
  if (typeof fetcher !== 'function') throw new Error('No fetch implementation is available.');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const response = await fetcher(sourceUrl, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`Archive source returned HTTP ${response.status}.`);
    const payload = await response.json();
    if (!payload || !Array.isArray(payload.items)) {
      throw new Error('Archive source did not return an items array.');
    }
    return payload.items;
  } finally {
    clearTimeout(timer);
  }
}

export async function generateArchivePrerender({
  distDir = process.env.ARCHIVE_PRERENDER_DIST_DIR || DEFAULT_DIST_DIR,
  sourceUrl = process.env.ARCHIVE_SOURCE_URL || ARCHIVE_SOURCE_URL,
  fetchImpl = globalThis.fetch,
} = {}) {
  const paths = outputPaths(distDir);
  const buildTimestamp = parseBuildTimestamp();
  const template = await readFile(paths.indexOutput, 'utf8');
  let normalisedItems = [];
  let items = [];

  try {
    const rawItems = await fetchArchiveItems(sourceUrl, fetchImpl);
    normalisedItems = normaliseItems(rawItems, buildTimestamp);
    items = normalisedItems.slice(0, MAX_ARCHIVE_ITEMS);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[archive-prerender] Using the no-items fallback: ${message}`);
  }

  await mkdir(dirname(paths.archiveOutput), { recursive: true });
  await writeFile(paths.archiveOutput, buildArchiveHtml(template, items), 'utf8');

  const sitemap = await readFile(paths.sitemapOutput, 'utf8');
  // Event dates control archive ordering, not sitemap freshness. Only source
  // metadata that is no later than this build can describe when the archive
  // content was actually ingested or modified.
  const lastmod = newestArchiveFreshness(normalisedItems, buildTimestamp) || buildTimestamp;
  const updatedSitemap = updateArchiveLastmod(sitemap, lastmod);
  if (updatedSitemap !== sitemap) await writeFile(paths.sitemapOutput, updatedSitemap, 'utf8');

  console.log(
    `[archive-prerender] Wrote ${items.length} archive item${items.length === 1 ? '' : 's'} to dist/updates/archive/index.html.`
  );
}

const entryPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  generateArchivePrerender().catch(error => {
    console.error(`[archive-prerender] Build failed: ${error.message}`);
    process.exitCode = 1;
  });
}
