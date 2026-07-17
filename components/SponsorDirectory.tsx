import React, { useEffect, useMemo, useRef, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { SponsorDirectoryEntry, SponsorDirectoryFacet } from '../types';
import { Search, Filter, AlertCircle, ChevronRight } from 'lucide-react';

const PAGE_SIZE = 24;
const DEBOUNCE_MS = 350;

interface SponsorDirectoryProps {
  onSelectCompany: (name: string) => void;
}

export const SponsorDirectory: React.FC<SponsorDirectoryProps> = ({ onSelectCompany }) => {
  const [industry, setIndustry] = useState('all');
  const [route, setRoute] = useState('all');
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [items, setItems] = useState<SponsorDirectoryEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [industries, setIndustries] = useState<SponsorDirectoryFacet[]>([]);
  const [routes, setRoutes] = useState<SponsorDirectoryFacet[]>([]);
  const [mapGeneratedAt, setMapGeneratedAt] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards against a stale (slow, superseded) fetch clobbering newer state —
  // only the response matching the latest request id is ever applied.
  const requestId = useRef(0);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    apiClient
      .fetchSponsorDirectory({ industry, route, q: debouncedQuery, page: 1, pageSize: PAGE_SIZE })
      .then(res => {
        if (id !== requestId.current) return;
        setItems(res.items);
        setTotal(res.total);
        setIndustries(res.industries);
        setRoutes(res.routes);
        setMapGeneratedAt(res.mapGeneratedAt);
        setPage(1);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setError('Unable to load the sponsor directory. Please check your connection.');
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoading(false);
      });
  }, [industry, route, debouncedQuery]);

  const loadMore = () => {
    const id = ++requestId.current;
    const nextPage = page + 1;
    setLoadingMore(true);
    apiClient
      .fetchSponsorDirectory({ industry, route, q: debouncedQuery, page: nextPage, pageSize: PAGE_SIZE })
      .then(res => {
        if (id !== requestId.current) return;
        setItems(prev => [...prev, ...res.items]);
        setTotal(res.total);
        setPage(nextPage);
      })
      .catch(() => {
        if (id !== requestId.current) return;
        setError('Unable to load more sponsors. Please try again.');
      })
      .finally(() => {
        if (id !== requestId.current) return;
        setLoadingMore(false);
      });
  };

  // "All" always shown; real sections ordered by count (most sponsors
  // first) so the busiest industries surface without scrolling; the
  // currently-selected pill stays visible even if its count is 0.
  const orderedIndustries = useMemo(() => {
    const all = industries.find(f => f.id === 'all');
    const unknown = industries.find(f => f.id === 'unknown');
    const rest = industries.filter(f => f.id !== 'all' && f.id !== 'unknown').sort((a, b) => b.count - a.count);
    const ordered = [all, ...rest, unknown].filter((f): f is SponsorDirectoryFacet => !!f);
    return ordered.filter(f => f.id === 'all' || f.id === industry || f.count > 0);
  }, [industries, industry]);

  return (
    <div>
      <div className="space-y-2 mb-6">
        <label htmlFor="sponsor-directory-search" className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
          Search by name or town
        </label>
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-slate-500" />
          <input
            id="sponsor-directory-search"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. Tesco, or Manchester"
            className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-indigo-900/40 dark:focus:border-indigo-500"
          />
        </div>
      </div>

      <div className="flex flex-wrap gap-2 mb-4" role="group" aria-label="Filter by industry">
        {orderedIndustries.map(f => (
          <button
            key={f.id}
            type="button"
            aria-pressed={industry === f.id}
            onClick={() => setIndustry(f.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
              industry === f.id
                ? 'bg-slate-900 text-white shadow-lg shadow-slate-900/20 dark:bg-slate-100 dark:text-slate-900 dark:shadow-black/40'
                : 'bg-white text-slate-500 border border-slate-200 hover:border-slate-300 hover:text-slate-800 dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-slate-600 dark:hover:text-slate-200'
            }`}
          >
            {f.label}
            <span className="text-xs opacity-70">{f.count.toLocaleString()}</span>
          </button>
        ))}
      </div>

      <div className="mb-6 max-w-sm">
        <label htmlFor="sponsor-directory-route" className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 block mb-2">
          Visa route
        </label>
        <select
          id="sponsor-directory-route"
          value={route}
          onChange={(e) => setRoute(e.target.value)}
          className="w-full p-3 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 text-sm font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-indigo-900/40 dark:focus:border-indigo-500"
        >
          {routes.map(r => (
            <option key={r.id} value={r.id}>
              {r.label} ({r.count.toLocaleString()})
            </option>
          ))}
        </select>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-100 p-4 mb-6 text-red-700 rounded-xl flex items-center gap-3 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!loading && !error && (
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4" aria-live="polite">
          {total.toLocaleString()} sponsor{total === 1 ? '' : 's'}
        </p>
      )}

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[1, 2, 3, 4, 5, 6].map(i => (
            <div key={i} className="h-32 bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 shadow-sm animate-pulse space-y-3">
              <div className="h-5 w-2/3 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-3 w-1/3 bg-slate-100 dark:bg-slate-800 rounded"></div>
              <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded"></div>
            </div>
          ))}
        </div>
      ) : items.length === 0 && !error ? (
        <div className="text-center py-24 bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700">
          <Filter className="w-12 h-12 text-slate-200 dark:text-slate-700 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">No sponsors match</h3>
          <p className="text-slate-400 dark:text-slate-500">Try a different industry, route, or search term.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {items.map((item, i) => (
              <button
                key={`${item.name}-${i}`}
                type="button"
                onClick={() => onSelectCompany(item.name)}
                aria-label={`Check ${item.name}`}
                className="text-left bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 shadow-sm hover:shadow-md hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h4 className="font-semibold text-slate-900 dark:text-slate-100 leading-snug">{item.name}</h4>
                  <ChevronRight className="w-4 h-4 text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 dark:group-hover:text-indigo-400 flex-shrink-0 mt-0.5" />
                </div>
                {item.town && <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">{item.town}</p>}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {item.routes.slice(0, 2).map(r => (
                    <span key={r} className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300 truncate max-w-[140px]">
                      {r}
                    </span>
                  ))}
                  {item.routes.length > 2 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-[11px] font-medium text-slate-500 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-400">
                      +{item.routes.length - 2}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 text-[11px] font-semibold dark:bg-indigo-950/40 dark:text-indigo-300">
                    {item.industryLabel}
                  </span>
                  {item.rating !== 'Unknown' && (
                    <span
                      className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${
                        item.rating === 'Grade A'
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300'
                      }`}
                    >
                      {item.rating}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>

          {items.length < total && (
            <div className="flex justify-center mt-8">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-6 py-3 rounded-xl bg-white border border-slate-200 font-semibold text-slate-700 hover:border-indigo-300 hover:text-indigo-700 disabled:opacity-50 transition-colors shadow-sm dark:bg-slate-900 dark:border-slate-700 dark:text-slate-300 dark:hover:border-indigo-600 dark:hover:text-indigo-400"
              >
                {loadingMore ? 'Loading...' : `Load more (${(total - items.length).toLocaleString()} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {mapGeneratedAt && (
        <p className="text-xs text-slate-400 dark:text-slate-500 mt-8">
          Industry derived from Companies House records ({new Date(mapGeneratedAt).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' })}); sponsors without a confident match appear under Other / Unknown.
        </p>
      )}
    </div>
  );
};
