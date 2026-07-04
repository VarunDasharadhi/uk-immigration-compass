import React, { useEffect, useState, useMemo } from 'react';
import { apiClient } from '../services/apiClient';
import { GroundingChunk, NewsItem } from '../types';
import { isOfficialUrl } from '../utils/newsParsing';
import { UpdateCard } from './news/UpdateCard';
import { UpdateDetailModal } from './news/UpdateDetailModal';
import { CategoryIcon, CATEGORIES } from './news/newsShared';
import {
  ExternalLink, Filter, AlertCircle, CheckCircle2,
} from 'lucide-react';

export const NewsDashboard: React.FC = () => {
  const [newsItems, setNewsItems] = useState<NewsItem[]>([]);
  const [sources, setSources] = useState<GroundingChunk[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiClient.fetchUpdates();
      setSources(result.sources || []);
      setNewsItems(result.items || []);
    } catch (err) {
      setError('Unable to retrieve the latest news. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const filteredItems = useMemo(() => {
    if (selectedCategory === 'All') return newsItems;
    return newsItems.filter(item => item.category === selectedCategory);
  }, [newsItems, selectedCategory]);

  const officialSources = useMemo(() => {
    return sources.filter(s => s.web?.uri && isOfficialUrl(s.web.uri));
  }, [sources]);

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      {/* Header & Controls */}
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-end mb-10 gap-6">
        <div>
          <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">Recent Updates</h2>
          <p className="text-slate-500 mt-3 text-lg font-light max-w-2xl">
            Real-time feed of parliamentary activity and Home Office rule changes.
          </p>
        </div>
      </div>

      {/* Category Pills */}
      <div className="flex flex-wrap gap-2 mb-8 border-b border-slate-100 pb-2 sticky top-20 z-30 bg-[#F8FAFC]/95 backdrop-blur-sm py-2 -mx-2 px-2">
        {CATEGORIES.map(cat => (
          <button
            key={cat}
            onClick={() => setSelectedCategory(cat)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200
            ${selectedCategory === cat
              ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 translate-y-[-1px]'
              : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-800'}`}
          >
            {cat !== 'All' && <CategoryIcon category={cat} />}
            {cat}
          </button>
        ))}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 mb-8 text-red-700 rounded-xl flex items-center gap-3">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-72 bg-white rounded-2xl border border-slate-100 p-6 shadow-sm animate-pulse flex flex-col gap-4">
                <div className="h-6 w-1/3 bg-slate-100 rounded-full"></div>
                <div className="h-8 w-3/4 bg-slate-100 rounded-lg"></div>
                <div className="h-20 w-full bg-slate-100 rounded-lg"></div>
              </div>
            ))}
          </div>
          <div className="lg:col-span-4 xl:col-span-3 h-96 bg-slate-200/50 rounded-2xl animate-pulse"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Feed */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-6">
            {filteredItems.length === 0 ? (
              <div className="text-center py-24 bg-white rounded-2xl border border-dashed border-slate-300">
                <Filter className="w-12 h-12 text-slate-200 mx-auto mb-4" />
                <h3 className="text-lg font-bold text-slate-900">No updates found</h3>
                <p className="text-slate-400">There are no recent updates for this category.</p>
                {selectedCategory !== 'All' && (
                  <button
                    onClick={() => setSelectedCategory('All')}
                    className="mt-4 text-blue-600 text-sm font-semibold hover:underline"
                  >
                    View All Updates
                  </button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {filteredItems.map((item) => (
                  <UpdateCard key={item.id} item={item} onClick={() => setSelectedItem(item)} />
                ))}
              </div>
            )}
          </div>

          {/* Sidebar Sources */}
          <aside className="lg:col-span-4 xl:col-span-3">
            <div className="bg-slate-900 text-slate-200 rounded-3xl p-6 sm:p-8 sticky top-28 shadow-2xl ring-1 ring-white/10">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                  Verified Sources
                </h3>
              </div>

              <p className="text-xs text-slate-400 mb-6 leading-relaxed border-b border-slate-800 pb-4">
                We ground our AI in data exclusively from Gov.uk, the House of Commons Library, and official Hansard records.
              </p>

              <div className="space-y-3">
                {officialSources.length > 0 ? (
                  officialSources.slice(0, 8).map((source, idx) => (
                    <a
                      key={idx}
                      href={source.web?.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-start gap-3 p-3 rounded-xl bg-slate-800/50 hover:bg-blue-600/20 transition-all border border-slate-700/50 hover:border-blue-500/50 group"
                    >
                      <div className="mt-1 w-6 h-6 rounded-full bg-slate-800 flex items-center justify-center flex-shrink-0 group-hover:bg-blue-500 transition-colors border border-slate-700">
                        <ExternalLink className="w-3 h-3 text-slate-400 group-hover:text-white" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 group-hover:text-white line-clamp-2 leading-snug">
                          {source.web?.title}
                        </p>
                        <p className="text-[10px] text-slate-500 mt-1 truncate uppercase tracking-wider">{new URL(source.web?.uri || 'https://gov.uk').hostname}</p>
                      </div>
                    </a>
                  ))
                ) : (
                  <div className="text-slate-500 text-sm p-4 text-center border border-slate-800 rounded-xl border-dashed">
                    No verified official sources linked to this search.
                  </div>
                )}
              </div>
            </div>
          </aside>
        </div>
      )}

      {selectedItem && (
        <UpdateDetailModal
          item={selectedItem}
          officialSources={officialSources}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </div>
  );
};
