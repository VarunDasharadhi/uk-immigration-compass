import { setPageMeta } from './seo';

const ARCHIVE_DESCRIPTION =
  'Search every UK immigration update from the past year: Home Office rule changes, visa news and parliamentary activity, organised by category.';

describe('setPageMeta', () => {
  beforeEach(() => {
    document.head.innerHTML = `
      <title>Default title</title>
      <meta name="description" content="Default description" />
      <meta name="robots" content="index, follow" />
      <meta property="og:title" content="Default Open Graph title" />
      <meta property="og:description" content="Default Open Graph description" />
      <meta property="og:url" content="https://uk-immigration-compass.vercel.app/" />
      <meta name="twitter:title" content="Default Twitter title" />
      <meta name="twitter:description" content="Default Twitter description" />
      <link rel="canonical" href="https://uk-immigration-compass.vercel.app/" />
    `;
    document.title = 'Default title';
  });

  it('updates all route-specific metadata for the archive', () => {
    setPageMeta('UK Immigration Updates Archive', ARCHIVE_DESCRIPTION, '/updates/archive');

    expect(document.title).toBe('UK Immigration Updates Archive | UK Immigration Compass');
    expect(document.querySelector('meta[name="description"]')?.getAttribute('content')).toBe(ARCHIVE_DESCRIPTION);
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('index, follow');
    expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(
      'https://uk-immigration-compass.vercel.app/updates/archive'
    );
    expect(document.querySelector('meta[property="og:title"]')?.getAttribute('content')).toBe(
      'UK Immigration Updates Archive | UK Immigration Compass'
    );
    expect(document.querySelector('meta[property="og:description"]')?.getAttribute('content')).toBe(ARCHIVE_DESCRIPTION);
    expect(document.querySelector('meta[property="og:url"]')?.getAttribute('content')).toBe(
      'https://uk-immigration-compass.vercel.app/updates/archive'
    );
    expect(document.querySelector('meta[name="twitter:title"]')?.getAttribute('content')).toBe(
      'UK Immigration Updates Archive | UK Immigration Compass'
    );
    expect(document.querySelector('meta[name="twitter:description"]')?.getAttribute('content')).toBe(ARCHIVE_DESCRIPTION);
    expect(document.querySelector('meta[name="twitter:url"]')?.getAttribute('content')).toBe(
      'https://uk-immigration-compass.vercel.app/updates/archive'
    );
  });

  it('adds FAQ schema only when the visible homepage news view requests it', () => {
    setPageMeta('Homepage', 'Homepage description', '/', { includeFaq: true });

    const faq = document.getElementById('faq-schema');
    expect(faq).not.toBeNull();
    expect(JSON.parse(faq?.textContent || '{}')).toMatchObject({
      '@type': 'FAQPage',
      mainEntity: expect.any(Array),
    });

    setPageMeta('Archive', ARCHIVE_DESCRIPTION, '/updates/archive');
    expect(document.getElementById('faq-schema')).toBeNull();

    setPageMeta('Page not found', 'This page does not exist.', null);
    expect(document.getElementById('faq-schema')).toBeNull();
    expect(document.querySelector('meta[name="robots"]')?.getAttribute('content')).toBe('noindex, follow');
  });
});
