import React, { useState, useEffect, useMemo } from 'react';
import { apiClient } from '../services/apiClient';
import { SponsorCheckResult, SponsorNewsItem } from '../types';
import { Search, Building2, AlertTriangle, CheckCircle, XCircle, ShieldAlert, Loader2, RefreshCcw, AlertCircle, Clock, ChevronRight, ExternalLink } from 'lucide-react';
import { buildCompanyDetailsLinks, buildOpenRolesLinks } from '../utils/companyLinks';
import { CompanyLookupResult } from '../types';

export const SponsorChecker: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<SponsorCheckResult | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [news, setNews] = useState<SponsorNewsItem[]>([]);
  const [newsLoading, setNewsLoading] = useState(true);
  const [companyLookup, setCompanyLookup] = useState<CompanyLookupResult | null>(null);
  const [companyLookupLoading, setCompanyLookupLoading] = useState(false);

  useEffect(() => {
    const loadNews = async () => {
      try {
        const news = await apiClient.fetchSponsorNews();
        setNews(Array.isArray(news) ? news : []);
        setNewsLoading(false);
      } catch (err) {
        console.error('Error loading news:', err);
        setNews([]);
        setNewsLoading(false);
      }
    };
    loadNews();
  }, []);

  useEffect(() => {
    if (!result || (result.status !== 'Licensed' && result.status !== 'Revoked')) {
      setCompanyLookup(null);
      setCompanyLookupLoading(false);
      return;
    }
    let cancelled = false;
    setCompanyLookup(null);
    setCompanyLookupLoading(true);
    apiClient.lookupCompany(result.companyName)
      .then((data) => { if (!cancelled) setCompanyLookup(data); })
      .catch(() => { if (!cancelled) setCompanyLookup(null); })
      .finally(() => { if (!cancelled) setCompanyLookupLoading(false); });
    return () => { cancelled = true; };
  }, [result]);

  const companyDetailsLinks = useMemo(() => {
    if (!result || (result.status !== 'Licensed' && result.status !== 'Revoked')) return [];
    const links = buildCompanyDetailsLinks(result.companyName);
    if (!companyLookup?.companiesHouseUrl) return links;
    return links.map(link =>
      link.label === 'Companies House' ? { ...link, url: companyLookup.companiesHouseUrl! } : link
    );
  }, [result, companyLookup]);

  const openRolesLinks = useMemo(() => {
    if (!result || (result.status !== 'Licensed' && result.status !== 'Revoked')) return [];
    return buildOpenRolesLinks(result.companyName);
  }, [result]);

  const runSearch = async (name: string) => {
    if (!name.trim()) return;

    setLoading(true);
    setResult(null);
    setSearchError(null);

    try {
      const data = await apiClient.checkSponsor(name) as SponsorCheckResult;
      setResult(data);
    } catch (err) {
      console.error(err);
      setSearchError("Couldn't check that company. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    runSearch(searchTerm);
  };

  const handleCandidateSelect = (candidateName: string) => {
    setSearchTerm(candidateName);
    runSearch(candidateName);
  };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      {/* Header */}
      <div className="text-center mb-10">
        <div className="inline-flex items-center justify-center p-3 bg-indigo-50 dark:bg-indigo-950/40 rounded-2xl mb-4">
          <Building2 className="w-8 h-8 text-indigo-600 dark:text-indigo-400" />
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight mb-4">
          Sponsor Checker & Updates
        </h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 max-w-2xl mx-auto leading-relaxed">
          Verify if an employer holds a valid UK Sponsor License and track the latest Home Office compliance news.
        </p>
      </div>

      <div className="grid lg:grid-cols-3 gap-8 items-start">
        {/* Left Column: Search & Result */}
        <div className="lg:col-span-2 space-y-8">
          {/* Search Card */}
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-black/30">
            <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-6 flex items-center gap-2">
              <Search className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
              Check an Employer
            </h3>
            <form onSubmit={handleSearch} className="space-y-4">
              <div className="space-y-2">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">Company Name</label>
                <input
                  type="text"
                  className="w-full p-4 bg-slate-50 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all font-medium text-slate-800 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-indigo-900/40 dark:focus:border-indigo-500"
                  placeholder="e.g. Acme Solutions Ltd"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !searchTerm}
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white font-bold rounded-xl transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-950/40 dark:disabled:bg-slate-700 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Verify License Status'}
              </button>
              {searchError && (
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 text-sm font-medium mt-2">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {searchError}
                </div>
              )}
            </form>
          </div>

          {/* Result Display */}
          {result && (
            <div className="bg-white dark:bg-slate-900 rounded-3xl overflow-hidden border border-slate-200 dark:border-slate-700 shadow-lg dark:shadow-black/40">
              {/* Status Banner */}
              <div className="p-8 pb-4 text-center">
                <h3 className="text-2xl font-bold text-slate-900 dark:text-slate-100 mb-6">{result.companyName} ({result.town})</h3>

                {result.status === 'Licensed' ? (
                  <div className="flex items-center justify-center gap-2 p-4 bg-emerald-50 text-emerald-700 rounded-xl border border-emerald-100 font-bold dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40">
                    <CheckCircle className="w-5 h-5" />
                    <span>Active Sponsor License</span>
                  </div>
                ) : result.status === 'Unknown' ? (
                  <div className="flex items-center justify-center gap-2 p-4 bg-amber-50 text-amber-700 rounded-xl border border-amber-100 font-bold dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900/40">
                    <AlertTriangle className="w-5 h-5" />
                    <span>{result.notes || 'Status Unknown'}</span>
                  </div>
                ) : (
                  <div className="flex items-center justify-center gap-2 p-4 bg-red-50 text-red-600 rounded-xl border border-red-100 font-bold dark:bg-red-950/40 dark:text-red-300 dark:border-red-900/40">
                    <XCircle className="w-5 h-5" />
                    <span>License Status: {result.status}</span>
                  </div>
                )}
              </div>

              <div className="p-8 pt-4">
                {/* Status Row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-0 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden mb-8">
                  <div className="p-4 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Company</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{result.companyName}</span>
                  </div>
                  <div className="p-4 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-200 dark:bg-slate-800 dark:border-slate-700">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Location</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{result.town}</span>
                  </div>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Rating</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100">{result.rating}</span>
                  </div>
                </div>

                {/* Details row */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Sponsor Type</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{result.sponsorType || 'Unknown'}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Date Granted</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{result.dateGranted || 'Unknown'}</span>
                  </div>
                  <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800">
                    <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-1">Routes</span>
                    <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{result.routes?.length ? result.routes.join(', ') : 'Unknown'}</span>
                  </div>
                </div>

                {/* Nature of Business */}
                <div className="mb-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-3">Nature of business</h4>
                  <div className="p-4 rounded-xl border border-slate-200 bg-white text-slate-600 text-sm font-medium dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300">
                    {companyLookupLoading && !companyLookup ? (
                      <span className="inline-block h-4 w-40 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
                    ) : (
                      companyLookup?.natureOfBusiness || result.natureOfBusiness || 'Information unavailable'
                    )}
                  </div>
                </div>

                {/* Find out more — constructed search links, not guessed exact
                    URLs; the Companies House entry swaps in a real profile
                    link once /api/company-lookup resolves a confident match.
                    Only for confirmed results — not the Not Found / candidate-picker state. */}
                {(result.status === 'Licensed' || result.status === 'Revoked') && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      Find out more
                    </h4>
                    <div className="space-y-4">
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Company</span>
                        <div className="flex flex-wrap gap-2">
                          {companyDetailsLinks.map((link) => (
                            <a
                              key={link.label}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider block mb-2">Open roles</span>
                        <div className="flex flex-wrap gap-2">
                          {openRolesLinks.map((link) => (
                            <a
                              key={link.label}
                              href={link.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-1.5 rounded-full border border-slate-200 bg-slate-50 text-sm font-medium text-slate-700 hover:bg-indigo-50 hover:border-indigo-200 hover:text-indigo-700 transition-colors dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700 dark:hover:text-indigo-300"
                            >
                              {link.label}
                            </a>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Licence History */}
                {result.history && result.history.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-4 flex items-center gap-2">
                      <Clock className="w-4 h-4 text-indigo-500 dark:text-indigo-400" />
                      Licence History
                    </h4>
                    <div className="relative pl-4 border-l-2 border-slate-200 dark:border-slate-700 space-y-4">
                      {result.history.map((event, i) => {
                        const isGranted = /granted|licensed|added/i.test(event.status);
                        const isRevoked = /revoked|suspended|enforcement/i.test(event.status);
                        const dotColor = isGranted ? 'bg-emerald-500' : isRevoked ? 'bg-red-500' : 'bg-amber-400';
                        const textColor = isGranted ? 'text-emerald-700 dark:text-emerald-400' : isRevoked ? 'text-red-600 dark:text-red-400' : 'text-amber-700 dark:text-amber-400';
                        const bgColor = isGranted ? 'bg-emerald-50 border-emerald-100 dark:bg-emerald-950/30 dark:border-emerald-900/40' : isRevoked ? 'bg-red-50 border-red-100 dark:bg-red-950/30 dark:border-red-900/40' : 'bg-amber-50 border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40';
                        return (
                          <div key={i} className="relative">
                            <div className={`absolute -left-[21px] top-3 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${dotColor}`} />
                            <div className={`p-4 rounded-xl border ${bgColor}`}>
                              <div className="flex items-center gap-2 mb-1">
                                <ChevronRight className={`w-3.5 h-3.5 ${textColor}`} />
                                <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>{event.status}</span>
                                <span className="text-xs text-slate-400 dark:text-slate-500 ml-auto">{event.date}</span>
                              </div>
                              <p className="text-sm text-slate-700 dark:text-slate-300">{event.details}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Notes (for non-licensed / revoked companies) */}
                {result.notes && result.status !== 'Licensed' && (
                  <div className="mb-8 p-4 rounded-xl border border-amber-100 bg-amber-50 text-sm text-amber-800 dark:border-amber-900/40 dark:bg-amber-950/30 dark:text-amber-300">
                    <span className="font-bold block mb-1">Additional information</span>
                    {result.notes}
                  </div>
                )}

                {/* Possible matches — the search wasn't an exact/confirmed hit, so
                    surface similarly-named entries (current or historically revoked)
                    for the user to pick, rather than silently guessing which one they
                    meant. Each is tagged with its status so a revoked suggestion never
                    looks like a live one. */}
                {result.candidates && result.candidates.length > 0 && (
                  <div className="mb-8">
                    <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 mb-1">
                      {result.candidates.length === 1 ? 'Possible match' : 'Possible matches'}
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                      No exact entry was found for "{searchTerm}". These are similarly named — select the one you meant to check its confirmed status.
                    </p>
                    <div className="space-y-2">
                      {result.candidates.map((candidate, i) => (
                        <button
                          key={i}
                          type="button"
                          onClick={() => handleCandidateSelect(candidate.name)}
                          className="w-full text-left p-4 rounded-xl border border-slate-200 bg-slate-50 hover:bg-indigo-50 hover:border-indigo-200 transition-colors flex items-center justify-between gap-4 dark:border-slate-700 dark:bg-slate-800 dark:hover:bg-indigo-950/30 dark:hover:border-indigo-700"
                        >
                          <div>
                            <span className="font-semibold text-slate-900 dark:text-slate-100 block">{candidate.name}</span>
                            <span className="text-xs text-slate-500 dark:text-slate-400">{candidate.town} · {candidate.route}</span>
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full ${candidate.status === 'Revoked' ? 'bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-300' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                              {candidate.status}
                            </span>
                            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>

        {/* Right Column: Recently Added & Revoked Sponsors */}
        <div className="bg-slate-900 rounded-3xl p-6 md:p-8 text-white h-full relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-500/20 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2 pointer-events-none"></div>

          <div className="relative z-10">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <RefreshCcw className="w-5 h-5 text-indigo-400" />
              Recently Added & Revoked
            </h3>

            <div className="space-y-6 max-h-[500px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-600 scrollbar-track-transparent hover:scrollbar-thumb-slate-500 transition-colors">
              {newsLoading ? (
                [1, 2, 3].map(i => (
                  <div key={i} className="animate-pulse space-y-2">
                    <div className="h-4 bg-slate-700 rounded w-3/4"></div>
                    <div className="h-12 bg-slate-800 rounded w-full"></div>
                  </div>
                ))
              ) : news.length > 0 ? (
                news.map((item, idx) => (
                  <div key={idx} className="group border-b border-slate-700 pb-4 last:border-0 last:pb-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                        {item.date || 'Recent'}
                      </span>
                    </div>
                    <h4 className="font-semibold text-slate-100 group-hover:text-white transition-colors">
                      {item.title || item.summary}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1">{item.summary || ''}</p>
                  </div>
                ))
              ) : (
                <div className="text-center p-4">
                  <ShieldAlert className="w-6 h-6 mx-auto text-slate-600 mb-2" />
                  <p className="text-sm text-slate-500">No recent compliance updates found.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
