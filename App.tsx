import React, { useState, useMemo, useCallback, useEffect, FC } from 'react';
import { createPortal } from 'react-dom';
import { Routes, Route, useNavigate } from 'react-router-dom';
import { Analytics } from '@vercel/analytics/react';
import {
  Newspaper,
  ScrollText,
  BookOpen,
  X,
  Compass,
  ArrowRight,
  ChevronRight,
  Building2,
  Mail,
  Copy,
  Check,
  Sun,
  Moon,
} from 'lucide-react';
import { Tab } from './types';
import { useTheme } from './contexts/ThemeContext';
import { NewsDashboard } from './components/NewsDashboard';
import { PetitionTracker } from './components/PetitionTracker';
import { SimplifierTool } from './components/SimplifierTool';
import { SponsorChecker } from './components/SponsorChecker';
import { ErrorBoundary } from './components/ErrorBoundary';
import { PrivacyPolicy } from './components/PrivacyPolicy';
import { TermsOfService } from './components/TermsOfService';
import { UpdatesArchivePage } from './components/UpdatesArchivePage';
import { AnimatedBackground } from './components/AnimatedBackground';
import { Reveal } from './components/Reveal';
import { HeroSkyline } from './components/HeroSkyline';
import { setPageMeta } from './utils/seo';

// ===================================================
// CONSTANTS & CONFIGURATION
// ===================================================

interface NavItemConfig {
  tab: Tab;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  ariaLabel: string;
}

const NAV_ITEMS: NavItemConfig[] = [
  {
    tab: Tab.NEWS,
    icon: Newspaper,
    label: 'News & Updates',
    ariaLabel: 'View latest immigration news and updates',
  },
  {
    tab: Tab.SPONSORS,
    icon: Building2,
    label: 'Sponsors',
    ariaLabel: 'Check sponsor company status',
  },
  {
    tab: Tab.PETITIONS,
    icon: ScrollText,
    label: 'Petitions',
    ariaLabel: 'View active parliament petitions',
  },
  {
    tab: Tab.SIMPLIFIER,
    icon: BookOpen,
    label: 'Jargon Buster',
    ariaLabel: 'Simplify legal immigration text',
  },
];

const CONTENT_MAP: Record<Tab, React.ComponentType> = {
  [Tab.NEWS]: NewsDashboard,
  [Tab.PETITIONS]: PetitionTracker,
  [Tab.SIMPLIFIER]: SimplifierTool,
  [Tab.SPONSORS]: SponsorChecker,
  [Tab.PRIVACY]: PrivacyPolicy,
  [Tab.TERMS]: TermsOfService,
};

// ===================================================
// SUB-COMPONENTS
// ===================================================

interface NavItemProps {
  config: NavItemConfig;
  isActive: boolean;
  onClick: () => void;
}

const NavItem: FC<NavItemProps> = ({ config, isActive, onClick }) => {
  const Icon = config.icon;

  return (
    <button
      onClick={onClick}
      aria-label={config.ariaLabel}
      aria-current={isActive ? 'page' : undefined}
      className={`relative shrink-0 flex items-center gap-1.5 sm:gap-2 px-3.5 py-2 sm:px-5 sm:py-2.5 rounded-full transition-all duration-300 text-xs sm:text-sm font-medium whitespace-nowrap group
        ${
          isActive
            ? 'text-white bg-gradient-to-r from-blue-600 to-cyan-500 shadow-md shadow-blue-500/30 dark:text-sky-200 dark:bg-sky-400/10 dark:shadow-none dark:ring-1 dark:ring-sky-300/30'
            : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
        }`}
    >
      <Icon
        className={`w-4 h-4 transition-colors ${
          isActive
            ? 'text-white dark:text-sky-300'
            : 'text-slate-400 group-hover:text-slate-900 dark:text-slate-500 dark:group-hover:text-slate-300'
        }`}
      />
      {config.label}
      {isActive && (
        <span
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-1 h-1 bg-white rounded-full mb-1.5 dark:bg-sky-300"
          aria-hidden="true"
        />
      )}
    </button>
  );
};

const ThemeToggle: FC = () => {
  const { theme, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
      className="p-2.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 transition-colors"
    >
      {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
    </button>
  );
};

interface HeaderProps {
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
}

const Header: FC<HeaderProps> = ({ activeTab, onTabChange }) => {
  const handleNavClick = useCallback(
    (tab: Tab) => {
      onTabChange(tab);
    },
    [onTabChange]
  );

  return (
    <header
      className="sticky top-0 z-50 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-gradient-to-r dark:from-[#0a1428] dark:via-slate-900 dark:to-[#0a1428]"
      role="banner"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-18 sm:h-20 flex items-center justify-between">
        {/* Logo */}
        <button
          onClick={() => handleNavClick(Tab.NEWS)}
          className="flex items-center gap-3 cursor-pointer group hover:opacity-80 transition-opacity"
          aria-label="Go to home"
        >
          <div className="w-10 h-10 bg-gradient-to-br from-sky-400 via-blue-500 to-cyan-400 rounded-xl flex items-center justify-center shadow-lg shadow-sky-500/40 ring-1 ring-white/25 group-hover:scale-105 group-hover:rotate-3 transition-transform duration-300">
            <Compass className="text-white w-6 h-6" />
          </div>
          <div className="flex flex-col justify-center">
            <h1 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight leading-tight">
              UK Immigration
            </h1>
            <span className="block text-xs font-bold bg-gradient-to-r from-blue-600 to-cyan-500 dark:from-sky-300 dark:to-cyan-300 bg-clip-text text-transparent tracking-[0.18em] leading-tight">
              COMPASS
            </span>
          </div>
        </button>

        {/* Desktop Nav */}
        <nav
          className="hidden md:flex items-center gap-2 bg-slate-100 p-1.5 rounded-full border border-slate-200 shadow-sm dark:bg-white/[0.06] dark:border-white/10"
          role="navigation"
          aria-label="Main navigation"
        >
          {NAV_ITEMS.map((item) => (
            <NavItem
              key={item.tab}
              config={item}
              isActive={activeTab === item.tab}
              onClick={() => handleNavClick(item.tab)}
            />
          ))}
        </nav>

        <div className="flex items-center gap-1">
          <ThemeToggle />
        </div>
      </div>

      {/* Mobile Nav — always visible, no menu button needed */}
      <nav
        className="md:hidden border-t border-slate-200 bg-white px-3 py-2 flex flex-wrap items-center gap-1.5 dark:border-slate-800 dark:bg-[#0c1428]/95"
        role="navigation"
        aria-label="Main navigation"
      >
        {NAV_ITEMS.map((item) => (
          <NavItem
            key={item.tab}
            config={item}
            isActive={activeTab === item.tab}
            onClick={() => handleNavClick(item.tab)}
          />
        ))}
      </nav>
    </header>
  );
};

interface HeroSectionProps {
  onExploreClick: () => void;
}

const HeroSection: FC<HeroSectionProps> = ({ onExploreClick }) => {
  return (
    <section
      className="relative overflow-hidden bg-slate-900 dark:bg-slate-950 pb-20 z-[1]"
      aria-label="Hero section"
    >
      {/* Westminster skyline silhouette along the bottom edge */}
      <HeroSkyline />
      <div
        className="absolute inset-0 bg-[url('/textures/cubes.png')] opacity-10 pointer-events-none"
        aria-hidden="true"
      />

      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 py-20 md:py-24 relative z-10">
        <Reveal className="max-w-4xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/10 border border-blue-400/20 text-blue-300 text-xs font-bold tracking-wider mb-8 backdrop-blur-sm">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-500" />
            </span>
            LIVE PARLIAMENTARY TRACKER
          </div>

          {/* Heading */}
          <h2 className="text-4xl md:text-7xl font-extrabold tracking-tight mb-8 text-white leading-[1.3] md:leading-[1.2] pb-4">
            Clarity in a changing <br />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-sky-300 via-cyan-300 to-teal-300 inline-block pb-2">
              Immigration System.
            </span>
          </h2>

          {/* Description */}
          <p className="text-xl md:text-2xl text-slate-300 mb-10 leading-relaxed max-w-3xl font-light">
            We watch government bills, visa rule changes, and parliamentary
            debates around the clock. Then we translate the legal jargon into
            plain English, so you always know where you stand.
          </p>

          {/* CTA Button */}
          <button
            onClick={onExploreClick}
            className="group bg-gradient-to-r from-blue-600 to-cyan-500 hover:from-blue-500 hover:to-cyan-400 text-white pl-8 pr-6 py-4 rounded-xl font-semibold transition-all shadow-xl shadow-blue-500/30 hover:shadow-cyan-500/40 hover:-translate-y-0.5 flex items-center gap-3"
            aria-label="See the latest updates"
          >
            See What's Changed
            <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </Reveal>
      </div>
    </section>
  );
};

interface FooterLinkProps {
  href: string;
  label: string;
}

const FooterLink: FC<FooterLinkProps> = ({ href, label }) => (
  <li>
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="hover:text-blue-400 transition flex items-center gap-2"
    >
      <ArrowRight className="w-3 h-3 text-slate-600" />
      {label}
    </a>
  </li>
);

const CONTACT_EMAIL = 'developerworld.net@gmail.com';

const ContactModal: FC<{ onClose: () => void }> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(CONTACT_EMAIL);
    } catch {
      // Clipboard API unavailable or denied; the email is still visible to copy manually.
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-md"
        onClick={onClose}
      ></div>

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-sm relative z-10 animate-in zoom-in-95 duration-200 p-8 text-center">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label="Close"
        >
          <X className="w-4 h-4 text-slate-600 dark:text-slate-300" />
        </button>

        <div className="inline-flex items-center justify-center p-3 bg-blue-50 dark:bg-blue-950/40 rounded-2xl mb-5">
          <Mail className="w-6 h-6 text-blue-600 dark:text-blue-400" />
        </div>
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2">Get in touch</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed mb-6">
          Questions, feedback, or something not working right? We read every message. Reach out anytime.
        </p>

        <button
          onClick={handleCopy}
          className="w-full flex items-center justify-between gap-3 bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 hover:border-blue-300 transition-colors group dark:bg-slate-800 dark:border-slate-700 dark:hover:border-blue-500"
        >
          <span className="text-sm font-semibold text-slate-800 dark:text-slate-100">{CONTACT_EMAIL}</span>
          {copied ? (
            <Check className="w-4 h-4 text-green-600 dark:text-green-400 shrink-0" />
          ) : (
            <Copy className="w-4 h-4 text-slate-400 group-hover:text-blue-600 dark:text-slate-500 dark:group-hover:text-blue-400 shrink-0" />
          )}
        </button>
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-3">
          {copied ? 'Copied to clipboard' : 'Tap to copy the email address'}
        </p>
      </div>
    </div>,
    document.body
  );
};

interface FooterProps {
  onNavigate: (tab: Tab) => void;
}

const Footer: FC<FooterProps> = ({ onNavigate }) => {
  const currentYear = new Date().getFullYear();
  const [contactOpen, setContactOpen] = useState(false);

  return (
    <footer
      className="bg-slate-900 border-t border-slate-800 pt-16 pb-12 mt-auto relative z-10"
      role="contentinfo"
    >
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
        {/* Brand Section */}
        <div className="md:col-span-2 pr-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 bg-gradient-to-br from-sky-400 to-cyan-500 rounded-lg flex items-center justify-center shadow-md shadow-sky-500/30">
              <Compass className="text-white w-5 h-5" />
            </div>
            <span className="text-lg font-bold text-slate-100">
              UK Immigration Compass
            </span>
          </div>
          <p className="text-slate-400 text-sm leading-relaxed max-w-md">
            We believe clear information is a right. UK Immigration Compass takes
            official government data and turns it into clear, simple guidance for
            applicants, students, and families, free of charge.
          </p>
        </div>

        {/* Resources Section */}
        <div>
          <h3 className="font-bold text-slate-100 mb-6 text-sm uppercase tracking-wider">
            Official Resources
          </h3>
          <ul className="space-y-3 text-sm text-slate-400">
            <FooterLink
              href="https://www.gov.uk/browse/visas-immigration"
              label="Gov.uk Visas"
            />
            <FooterLink
              href="https://petition.parliament.uk/"
              label="Parliament Petitions"
            />
            <FooterLink
              href="https://hansard.parliament.uk/"
              label="Hansard Records"
            />
          </ul>
        </div>

        {/* Legal Section */}
        <div>
          <h3 className="font-bold text-slate-100 mb-6 text-sm uppercase tracking-wider">
            Legal & Data
          </h3>
          <ul className="space-y-3 text-sm text-slate-400">
            <li className="flex items-center gap-2">
              <ArrowRight className="w-3 h-3 text-slate-600" /> Refreshed daily
              from official sources
            </li>
            <li>
              <button
                onClick={() => onNavigate(Tab.PRIVACY)}
                className="hover:text-blue-400 transition flex items-center gap-2"
              >
                <ArrowRight className="w-3 h-3 text-slate-600" /> Privacy Policy
              </button>
            </li>
            <li>
              <button
                onClick={() => onNavigate(Tab.TERMS)}
                className="hover:text-blue-400 transition flex items-center gap-2"
              >
                <ArrowRight className="w-3 h-3 text-slate-600" /> Terms of Use
              </button>
            </li>
            <li>
              <button
                onClick={() => setContactOpen(true)}
                className="hover:text-blue-400 transition flex items-center gap-2"
              >
                <ArrowRight className="w-3 h-3 text-slate-600" /> Contact / Report an Issue
              </button>
            </li>
          </ul>
        </div>
      </div>

      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} />}

      {/* Bottom Bar */}
      <div className="max-w-[1600px] mx-auto px-4 sm:px-6 pt-8 border-t border-slate-800 flex flex-col md:flex-row justify-between items-center gap-4">
        <p className="text-xs text-slate-400">
          © {currentYear} UK Immigration Compass. Built on official data, explained by AI.
        </p>
        <div className="bg-amber-950/30 border border-amber-900/40 text-amber-200/70 px-4 py-2 rounded-lg text-xs font-medium max-w-xl text-center md:text-right">
          This is an AI-assisted information tool, not legal advice. For anything
          that matters to your case, verify with GOV.UK or a qualified adviser.
        </div>
      </div>
    </footer>
  );
};

// ===================================================
// MAIN APP COMPONENT
// ===================================================

// Tab slugs for the URL hash so a refresh (or a shared link) restores the
// exact tab the user was on: #/sponsors, #/petitions, and so on.
const TAB_HASHES: Record<Tab, string> = {
  [Tab.NEWS]: '',
  [Tab.SPONSORS]: 'sponsors',
  [Tab.PETITIONS]: 'petitions',
  [Tab.SIMPLIFIER]: 'jargon-buster',
  [Tab.PRIVACY]: 'privacy',
  [Tab.TERMS]: 'terms',
};

function tabFromHash(): Tab {
  // "sponsors/browse" -> "sponsors": the first segment picks the tab, any
  // suffix (like the Browse view) is that tab's own business.
  const slug = window.location.hash.replace(/^#\/?/, '').split('/')[0].replace(/\/+$/, '');
  const match = (Object.keys(TAB_HASHES) as Tab[]).find(t => TAB_HASHES[t] === slug);
  return match ?? Tab.NEWS;
}

const MainApp: FC = () => {
  const [activeTab, setActiveTab] = useState<Tab>(() =>
    window.location.pathname === '/' ? tabFromHash() : Tab.NEWS
  );
  const navigate = useNavigate();

  // Keep the hash in step with the active tab (replaceState: no history spam
  // from quick tab flips; Back still leaves the site as before).
  useEffect(() => {
    const slug = TAB_HASHES[activeTab];
    // The Sponsors tab carries a /browse suffix managed by SponsorChecker.
    const suffix = activeTab === Tab.SPONSORS && window.location.hash.includes('/browse')
      ? '/browse'
      : '';
    const target = slug ? `#/${slug}${suffix}` : '';
    if (window.location.hash !== target) {
      window.history.replaceState(null, '', `${window.location.pathname}${target}`);
    }
  }, [activeTab]);

  // Per-tab page titles and descriptions so each section can rank for its
  // own search topic. The index.html defaults cover the News feed.
  const pageMeta: Record<Tab, { title: string; description: string }> = {
    [Tab.NEWS]: {
      title: 'Latest UK Immigration News and Rule Changes',
      description:
        'Live feed of UK immigration news: Home Office rule changes, parliamentary debates and visa policy updates, explained in plain English.',
    },
    [Tab.SPONSORS]: {
      title: 'UK Sponsor Licence Checker',
      description:
        'Check whether a UK employer holds a valid Home Office sponsor licence, browse licensed sponsors by industry, and track compliance changes.',
    },
    [Tab.PETITIONS]: {
      title: 'Track UK Immigration Petitions',
      description:
        'Follow immigration petitions before the UK Parliament, with live signature counts and progress toward a Commons debate.',
    },
    [Tab.SIMPLIFIER]: {
      title: 'Immigration Jargon Buster',
      description:
        'Paste any Home Office letter or immigration clause and get an instant plain-English translation, free.',
    },
    [Tab.PRIVACY]: {
      title: 'Privacy Policy',
      description:
        'What UK Immigration Compass collects (almost nothing), what we never do with data, and how to contact us.',
    },
    [Tab.TERMS]: {
      title: 'Terms of Use',
      description:
        'The plain-English terms of use for UK Immigration Compass: free, no account needed, and not legal advice.',
    },
  };

  useEffect(() => {
    const meta = pageMeta[activeTab] ?? pageMeta[Tab.NEWS];
    setPageMeta(meta.title, meta.description);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  const ContentComponent = useMemo(() => {
    return CONTENT_MAP[activeTab] || NewsDashboard;
  }, [activeTab]);

  const handleExploreClick = useCallback(() => {
    navigate('/updates/archive');
  }, [navigate]);

  const handleFooterNavigate = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  return (
    <div
      className="relative min-h-screen bg-gradient-to-b from-sky-50 via-blue-50 to-cyan-100 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 flex flex-col font-sans selection:bg-blue-100 selection:text-blue-900 dark:selection:bg-blue-900 dark:selection:text-blue-100 overflow-x-hidden"
      role="application"
    >
      {/* Ambient animated backdrop (waves + orbs) */}
      <AnimatedBackground />

      {/* Navigation */}
      <Header activeTab={activeTab} onTabChange={setActiveTab} />

      {/* Hero Section (Only shows on News Tab) */}
      {activeTab === Tab.NEWS && (
        <HeroSection onExploreClick={handleExploreClick} />
      )}

      {/* Main Content */}
      <main className="flex-grow relative z-10" id="feed-start">
        <ErrorBoundary>
          <ContentComponent />
        </ErrorBoundary>
      </main>

      {/* Footer */}
      <Footer onNavigate={handleFooterNavigate} />
    </div>
  );
};

const App: FC = () => {
  return (
    <>
      <Analytics />
      <Routes>
        <Route path="/updates/archive" element={<UpdatesArchivePage />} />
        <Route path="*" element={<MainApp />} />
      </Routes>
    </>
  );
};

export default App;
