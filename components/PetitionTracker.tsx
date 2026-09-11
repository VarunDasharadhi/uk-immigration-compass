import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { PetitionItem, PetitionsResult } from '../types';
import { ScrollText, Milestone, PenTool, AlertCircle } from 'lucide-react';
import { PageHero } from './PageHero';
import { PetitionDetailModal } from './PetitionDetailModal';
import { Reveal } from './Reveal';
import { cacheGet, cacheSet, cacheHas } from '../utils/cache';

export const PetitionTracker: React.FC = () => {
  const [data, setData] = useState<PetitionsResult | null>(() => cacheGet<PetitionsResult>('petitions') ?? null);
  const [selected, setSelected] = useState<PetitionItem | null>(null);
  const [loading, setLoading] = useState<boolean>(() => !cacheHas('petitions'));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setError(null);
      try {
        const result = await apiClient.fetchPetitions();
        cacheSet('petitions', result);
        setData(result);
      } catch (e) {
        console.error(e);
        if (!cacheHas('petitions')) {
          setError('Unable to load petitions right now. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  const petitions = data?.petitions || [];
  const totalSignatures = petitions.reduce((sum, p) => sum + (typeof p.signatures === 'number' ? p.signatures : 0), 0);

  const getProgressWidth = (signatures: string | number) => {
    const num = typeof signatures === 'number' ? signatures : parseInt(signatures.replace(/[^0-9]/g, '')) || 0;
    // Cap at 100k for the bar visual
    const percentage = Math.min((num / 100000) * 100, 100);
    // Ensure at least a little bit shows if < 1%
    return Math.max(percentage, 2);
  };

  const formatSignatures = (signatures: string | number) =>
    typeof signatures === 'number' ? signatures.toLocaleString() : signatures;

  // Pictorial "road to a debate" lanes: the five most-signed petitions,
  // each drawn as a journey along the real petition milestones (10k forces
  // a government response, 100k gets it considered for a Commons debate).
  const numericSigs = (p: { signatures: string | number }) =>
    typeof p.signatures === 'number' ? p.signatures : parseInt(String(p.signatures).replace(/[^0-9]/g, '')) || 0;

  const topPetitions = [...petitions]
    .sort((a, b) => numericSigs(b) - numericSigs(a))
    .slice(0, 5);

  const wembleyFill = totalSignatures / 90000;

  return (
    <div>
      <PageHero
        icon={ScrollText}
        title="Active Petitions"
        description="Follow the public's voice on immigration policy, and watch signatures climb toward a Commons debate."
        badge={
          <>
            <ScrollText className="w-3.5 h-3.5" />
            Parliament Live
          </>
        }
      />
      <div className="max-w-[1600px] mx-auto p-4 md:p-8">

      <div className="mb-12">
        <Reveal>
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-black/30 relative overflow-hidden">
          <div className="flex items-start justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                    <Milestone className="w-5 h-5 text-blue-700 dark:text-blue-400" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">The Road to a Commons Debate</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Live from UK Parliament: every petition's journey, checkpoint by checkpoint</p>
                </div>
            </div>
            <div className="text-right flex-shrink-0">
                <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight block leading-tight">
                    {totalSignatures >= 1000 ? `${(totalSignatures / 1000).toFixed(1)}k` : totalSignatures}
                </span>
                <span className="text-[10px] text-slate-400 dark:text-slate-500 uppercase tracking-wider">signatures</span>
            </div>
          </div>

          {totalSignatures >= 90000 && (
            <p className="text-sm text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 mb-6">
              That crowd would fill Wembley Stadium {wembleyFill.toFixed(1)} times.
            </p>
          )}

          {/* Stage legend */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-8 text-xs">
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-slate-300 dark:bg-slate-600 flex-shrink-0" />
              Opened on the petition site
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 flex-shrink-0" />
              <span><strong className="text-slate-700 dark:text-slate-300">10,000</strong> · government must respond</span>
            </div>
            <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600 flex-shrink-0" />
              <span><strong className="text-slate-700 dark:text-slate-300">100,000</strong> · considered for a debate</span>
            </div>
          </div>

          {loading ? (
            <div className="space-y-6 animate-pulse">
              {[1, 2, 3].map(i => (
                <div key={i} className="space-y-2">
                  <div className="h-4 bg-slate-100 dark:bg-slate-800 rounded w-2/3"></div>
                  <div className="h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full"></div>
                </div>
              ))}
            </div>
          ) : topPetitions.length > 0 ? (
            <div className="space-y-7">
              {topPetitions.map((p) => {
                const sig = numericSigs(p);
                const pct = Math.min((sig / 100000) * 100, 100);
                const hit10k = sig >= 10000;
                const hit100k = sig >= 100000;
                return (
                  <div key={p.id}>
                    <div className="flex items-baseline justify-between gap-3 mb-2">
                      <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{p.title}</h4>
                      <span className="text-xs font-bold text-slate-500 dark:text-slate-400 flex-shrink-0 tabular-nums">
                        {formatSignatures(sig)}
                      </span>
                    </div>
                    <div className="relative h-2.5 rounded-full bg-slate-100 dark:bg-slate-800">
                      <div
                        className="absolute inset-y-0 left-0 bg-blue-600 rounded-full transition-all duration-700"
                        style={{ width: `${Math.max(pct, 1.5)}%` }}
                      />
                      {/* Government-response checkpoint at 10k */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: '10%' }}
                        title="10,000 signatures: the government must respond"
                      >
                        <div className={`w-4 h-4 rounded-full border-2 transition-colors ${hit10k
                          ? 'bg-emerald-400 border-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`} />
                      </div>
                      {/* Debate checkpoint at 100k */}
                      <div
                        className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
                        style={{ left: '100%' }}
                        title="100,000 signatures: considered for a Commons debate"
                      >
                        <div className={`w-5 h-5 rounded-full border-2 transition-colors ${hit100k
                          ? 'bg-blue-600 border-white dark:border-slate-900 shadow-[0_0_0_3px_rgba(37,99,235,0.25)]'
                          : 'bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600'}`} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-1.5 h-4">
                      {hit100k ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400">
                          Reached the debate threshold
                        </span>
                      ) : hit10k ? (
                        <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                          Government response earned
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                          {(10000 - sig).toLocaleString()} more signatures for a government response
                        </span>
                      )}
                      <span className="text-[10px] text-slate-400 dark:text-slate-500 ml-auto tabular-nums">
                        {Math.floor(pct)}% of the way
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="h-24 flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
              {loading ? 'Loading live petition data…' : 'No petition data available.'}
            </div>
          )}
        </div>
        </Reveal>
      </div>

      {/* Structured Petitions List */}
      <div className="space-y-6">
        {error && (
          <div className="bg-red-50 border border-red-100 p-4 mb-4 text-red-700 rounded-xl flex items-center gap-3 dark:bg-red-950/30 dark:border-red-900/40 dark:text-red-300">
            <AlertCircle className="w-5 h-5 flex-shrink-0" />
            {error}
          </div>
        )}
        <div className="flex items-center justify-between mb-4">
             <h3 className="text-xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <span className="relative flex h-3 w-3">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-red-500"></span>
                </span>
                Trending Right Now
            </h3>
            <span className="text-sm text-slate-500 dark:text-slate-400 hidden sm:block">Updated daily from UK Parliament data</span>
        </div>

        {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {[1,2,3].map(i => (
                    <div key={i} className="h-48 bg-slate-100 rounded-2xl animate-pulse border border-slate-200 dark:bg-slate-800 dark:border-slate-700"></div>
                ))}
            </div>
        ) : petitions.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                {petitions.map((petition, i) => (
                    <Reveal key={petition.id} delay={(i % 3) * 90}>
                    <button
                        type="button"
                        onClick={() => setSelected(petition)}
                        aria-label={`Open details for ${petition.title}`}
                        className="text-left bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:border-blue-200 dark:hover:border-blue-700 transition-all group flex flex-col h-full w-full cursor-pointer">
                        <div className="flex justify-between items-start mb-4">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border
                                ${petition.status.toLowerCase().includes('open') ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40' :
                                  petition.status.toLowerCase().includes('debate') ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40' :
                                  'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                                {petition.status}
                            </span>
                            <PenTool className="w-4 h-4 text-slate-300 group-hover:text-blue-500 transition-colors dark:text-slate-600 dark:group-hover:text-blue-400" />
                        </div>

                        <h4 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 leading-tight group-hover:text-blue-700 transition-colors dark:text-slate-100 dark:group-hover:text-blue-400">
                            {petition.title}
                        </h4>
                        <p className="text-slate-500 text-sm leading-relaxed mb-6 flex-grow dark:text-slate-400">
                            {petition.summary}
                        </p>

                        <div className="mt-auto">
                             <div className="flex justify-between items-end mb-2">
                                <div className="flex flex-col">
                                    <span className="text-xs text-slate-400 font-medium uppercase tracking-wide dark:text-slate-500">Signatures</span>
                                    <span className="text-xl font-extrabold text-slate-800 dark:text-slate-100">{formatSignatures(petition.signatures)}</span>
                                </div>
                                <div className="text-right">
                                    <span className="text-[10px] text-slate-400 block dark:text-slate-500">Goal: 100k</span>
                                </div>
                             </div>
                             {/* Progress Bar */}
                             <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden dark:bg-slate-800">
                                <div
                                    className="h-full bg-blue-600 rounded-full transition-all duration-1000"
                                    style={{ width: `${getProgressWidth(petition.signatures)}%` }}
                                ></div>
                             </div>
                        </div>
                    </button>
                    </Reveal>
                ))}
            </div>
        ) : (
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 leading-relaxed dark:text-slate-400 dark:bg-slate-900 dark:border-slate-700">
                 <AlertCircle className="w-8 h-8 text-slate-300 mb-4 dark:text-slate-600" />
                 <p>No trending immigration petitions right now. Check back soon.</p>
            </div>
        )}

        {/* Sources Footer */}
        {data?.sources && data.sources.length > 0 && (
             <div className="flex flex-wrap items-center gap-3 pt-4 border-t border-slate-200/60 dark:border-slate-700/60">
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider dark:text-slate-500">Sources:</span>
                {data.sources.filter(s => s.web).slice(0, 4).map((s, i) => (
                    <a
                        key={i}
                        href={s.web?.uri}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-medium bg-white text-slate-500 px-3 py-1.5 rounded-lg border border-slate-200 hover:border-blue-300 hover:text-blue-600 transition shadow-sm dark:bg-slate-900 dark:text-slate-400 dark:border-slate-700 dark:hover:border-blue-600 dark:hover:text-blue-400"
                    >
                        {s.web?.title || 'External Link'}
                    </a>
                ))}
            </div>
        )}
      </div>
      </div>
      {selected && (
        <PetitionDetailModal
          petition={selected}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
};