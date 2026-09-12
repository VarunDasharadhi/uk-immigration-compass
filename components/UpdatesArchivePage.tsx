import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { pageview } from '@vercel/analytics';
import { apiClient } from '../services/apiClient';
import { NewsItem } from '../types';
import { UpdateCard } from './news/UpdateCard';
import { UpdateDetailModal } from './news/UpdateDetailModal';
import { CategoryIcon, CATEGORIES } from './news/newsShared';
import { ArrowLeft, Search, AlertCircle, Filter, Archive } from 'lucide-react';
import { AnimatedBackground } from './AnimatedBackground';
import { PageHero } from './PageHero';
import { ArchiveArt } from './bandArt';
import { setPageMeta } from '../utils/seo';
import { Reveal } from './Reveal';

const PAGE_SIZE = 12;

export const UpdatesArchivePage: React.FC = () => {
  const [items, setItems] = useState<NewsItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [query, setQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  useEffect(() => {
    setPageMeta(
      'UK Immigration Updates Archive',
      'Search every UK immigration update from the past year: Home Office rule changes, visa news and parliamentary activity, organised by category.',
      '/updates/archive'
    );
  }, []);

  // This route renders outside MainApp, so nobody else sends its pageview.
  useEffect(() => {
    pageview({ route: '/updates/archive', path: '/updates/archive' });
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.fetchUpdatesArchive();
        setItems(result.items || []);
      } catch {
        setError("We couldn't load the archive. Check your connection and try again.");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items
      .filter(item => selectedCategory === 'All' || item.category === selectedCategory)
      .filter(item => !q || item.title.toLowerCase().includes(q) || item.summary.toLowerCase().includes(q))
      .sort((a, b) => b.parsedDate - a.parsedDate);
  }, [items, selectedCategory, query]);

  const visibleItems = filteredItems.slice(0, visibleCount);

  // Reset pagination whenever the filters change so a new search doesn't
  // start scrolled past its own first page of results.
  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [selectedCategory, query]);

  return (
    <div className="relative min-h-screen bg-gradient-to-b from-slate-50 via-slate-100 to-slate-50 dark:from-slate-950 dark:via-slate-950 dark:to-slate-900 overflow-x-hidden">
      <AnimatedBackground />
      <header className="sticky top-0 z-50 border-b border-slate-800 bg-gradient-to-r from-[#0a1428] via-slate-900 to-[#0a1428]">
        <div className="max-w-[1600px] mx-auto px-4 sm:px-6 h-18 sm:h-20 flex items-center gap-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-sm font-semibold text-slate-400 hover:text-blue-400 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to UK Immigration Compass
          </Link>
        </div>
      </header>

      <PageHero
        icon={Archive}
        title="Update Archive"
        description="Every immigration update from the past year, searchable and organised by category."
        art={<ArchiveArt />}
      />

      <div className="relative z-10 max-w-[1600px] mx-auto p-4 md:p-8">
        {items.length > 0 && (
          <Reveal className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
            {[
              { value: items.length.toLocaleString(), label: 'updates tracked this year' },
              { value: String(new Set(items.map(i => i.category)).size), label: 'categories covered' },
              { value: items[0]?.date || '', label: 'most recent update' },
            ].map((stat, i) => (
              <div key={i} className="bg-white/70 dark:bg-slate-900/60 rounded-2xl border border-slate-200/70 dark:border-slate-800 p-5 text-center">
                <p className="text-2xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">{stat.value}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{stat.label}</p>
              </div>
            ))}
          </Reveal>
        )}

        {/* Search */}
        <div className="relative mb-6 max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search past updates..."
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400 text-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-blue-900/40 dark:focus:border-blue-500"
          />
        </div>

        {/* Category Pills */}
        <div className="flex flex-wrap gap-2 mb-8">
          {CATEGORIES.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
              ${selectedCategory === cat
                ? 'bg-blue-700 text-white shadow-lg shadow-blue-500/25 translate-y-[-1px]'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200'}`}
            >
              {cat !== 'All' && <CategoryIcon category={cat} />}
              {cat}
            </button>
          ))}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-100 p-4 mb-8 text-red-700 rounded-xl flex items-center gap-3 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className="h-72 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm animate-pulse flex flex-col gap-4">
                <div className="h-6 w-1/3 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
                <div className="h-8 w-3/4 bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
                <div className="h-20 w-full bg-slate-100 dark:bg-slate-800 rounded-lg"></div>
              </div>
            ))}
          </div>
        ) : visibleItems.length === 0 ? (
          <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
            <Filter className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No matching updates</h3>
            <p className="text-slate-400 dark:text-slate-500">Try a different search term or category.</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              {visibleItems.map((item, i) => (
                <Reveal key={item.id} delay={(i % 4) * 90}>
                  <UpdateCard item={item} onClick={() => setSelectedItem(item)} />
                </Reveal>
              ))}
            </div>

            {visibleCount < filteredItems.length && (
              <div className="flex justify-center mt-10">
                <button
                  onClick={() => setVisibleCount(c => c + PAGE_SIZE)}
                  className="px-6 py-3 rounded-xl bg-white border border-slate-200 font-semibold text-slate-700 hover:border-blue-300 hover:text-blue-700 transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-blue-600 dark:hover:text-blue-400"
                >
                  Load more ({filteredItems.length - visibleCount} remaining)
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {selectedItem && (
        <UpdateDetailModal
          item={selectedItem}
          officialSources={[]}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
