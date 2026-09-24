const SITE_NAME = 'UK Immigration Compass';
const SITE_URL = 'https://uk-immigration-compass.vercel.app';
const FAQ_SCHEMA_ID = 'faq-schema';

const FAQ_SCHEMA = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: [
    {
      '@type': 'Question',
      name: 'How do I check if a company is a licensed sponsor in the UK?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'Open the Sponsors tab and search any employer. Results come from the official GOV.UK register of licensed sponsors, so you can see whether the licence is active and browse other companies in the same industry.',
      },
    },
    {
      '@type': 'Question',
      name: 'Where can I find the latest UK immigration rule changes?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Latest Updates feed tracks Home Office announcements, visa policy changes and parliamentary debates as they happen, with the impact and timeline spelled out for each update.',
      },
    },
    {
      '@type': 'Question',
      name: 'What does leave to remain mean?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'It means permission to stay in the UK for a limited time. Paste any Home Office letter into the Legal Jargon Buster and terms like this will be explained in plain English.',
      },
    },
    {
      '@type': 'Question',
      name: 'How can I follow immigration petitions in the UK?',
      acceptedAnswer: {
        '@type': 'Answer',
        text: 'The Petitions tab shows live signature counts for immigration petitions before UK Parliament, and how close each one is to being considered for a debate.',
      },
    },
  ],
};

interface PageMetaOptions {
  includeFaq?: boolean;
}

function setMetaContent(kind: 'name' | 'property', key: string, content: string) {
  const selector = `meta[${kind}="${key}"]`;
  let element = document.querySelector<HTMLMetaElement>(selector);

  if (!element) {
    element = document.createElement('meta');
    element.setAttribute(kind, key);
    document.head.appendChild(element);
  }

  element.setAttribute('content', content);
}

function setCanonicalUrl(url: string) {
  let element = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!element) {
    element = document.createElement('link');
    element.setAttribute('rel', 'canonical');
    document.head.appendChild(element);
  }
  element.setAttribute('href', url);
}

function setFaqSchema(enabled: boolean) {
  const existing = document.getElementById(FAQ_SCHEMA_ID) as HTMLScriptElement | null;
  if (!enabled) {
    existing?.remove();
    return;
  }

  const script = existing ?? document.createElement('script');
  script.id = FAQ_SCHEMA_ID;
  script.type = 'application/ld+json';
  script.textContent = JSON.stringify(FAQ_SCHEMA);
  if (!existing) document.head.appendChild(script);
}

/**
 * Updates the browser tab title and every route-level search metadata field.
 * The archive and the hash-routed tabs share one document, so these values must
 * be changed together whenever a route renders.
 *
 * canonicalPath:
 * - '/' (default), the homepage canonical, shared by all hash tabs
 * - '/updates/archive', the archive's own canonical
 * - null, an unknown route marked noindex
 */
export function setPageMeta(
  title: string,
  description: string,
  canonicalPath: string | null = '/',
  options: PageMetaOptions = {}
) {
  const fullTitle = `${title} | ${SITE_NAME}`;
  document.title = fullTitle;

  setMetaContent('name', 'description', description);
  setMetaContent('name', 'robots', canonicalPath === null ? 'noindex, follow' : 'index, follow');
  setMetaContent('property', 'og:title', fullTitle);
  setMetaContent('property', 'og:description', description);
  setMetaContent('property', 'og:url', `${SITE_URL}${canonicalPath ?? '/'}`);
  setMetaContent('name', 'twitter:title', fullTitle);
  setMetaContent('name', 'twitter:description', description);
  setMetaContent('name', 'twitter:url', `${SITE_URL}${canonicalPath ?? '/'}`);

  if (canonicalPath === null) {
    setFaqSchema(false);
    return;
  }

  setCanonicalUrl(`${SITE_URL}${canonicalPath}`);
  setFaqSchema(options.includeFaq === true);
}
