const SITE_NAME = 'UK Immigration Compass';
const SITE_URL = 'https://uk-immigration-compass.vercel.app';

/**
 * Updates the browser tab title, meta description, canonical URL and og:url
 * so each tab and route can rank for its own search topic. Without the
 * per-route canonical, /updates/archive would inherit the homepage's
 * canonical and be treated as a duplicate of it.
 *
 * canonicalPath:
 * - '/' (default) — the homepage canonical, shared by all hash tabs
 * - '/updates/archive' — the archive's own canonical
 * - null — marks an unknown route noindex (SPA soft-404)
 */
export function setPageMeta(title: string, description: string, canonicalPath: string | null = '/') {
  document.title = `${title} | ${SITE_NAME}`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', description);

  const robots = document.querySelector('meta[name="robots"]');
  if (!robots) return;

  if (canonicalPath === null) {
    robots.setAttribute('content', 'noindex, follow');
    return;
  }

  robots.setAttribute('content', 'index, follow');
  const url = `${SITE_URL}${canonicalPath}`;
  document.querySelector('link[rel="canonical"]')?.setAttribute('href', url);
  document.querySelector('meta[property="og:url"]')?.setAttribute('content', url);
}
