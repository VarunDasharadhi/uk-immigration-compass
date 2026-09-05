const SITE_NAME = 'UK Immigration Compass';

/**
 * Updates the browser tab title and meta description so each tab and route
 * can rank for its own search topic. The SPA starts from the static values in
 * index.html (the News feed); call this on tab or route change.
 */
export function setPageMeta(title: string, description: string) {
  document.title = `${title} | ${SITE_NAME}`;
  document
    .querySelector('meta[name="description"]')
    ?.setAttribute('content', description);
}
