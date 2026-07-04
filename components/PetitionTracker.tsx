import React, { useEffect, useState } from 'react';
import { apiClient } from '../services/apiClient';
import { PetitionsResult } from '../types';
import { ScrollText, TrendingUp, PenTool, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { useTheme } from '../contexts/ThemeContext';

export const PetitionTracker: React.FC = () => {
  const { theme } = useTheme();
  const [data, setData] = useState<PetitionsResult | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const result = await apiClient.fetchPetitions();
        setData(result);
      } catch (e) {
        console.error(e);
        setError('Unable to load petitions right now. Please try again later.');
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

  // Live snapshot, one bar per petition currently shown — Parliament's API
  // only gives a point-in-time count, not history, so this compares today's
  // real petitions rather than faking a week-over-week trend. Horizontal bars
  // so full petition titles read as row labels instead of colliding under
  // rotated/truncated x-axis text.
  const chartData = petitions.map(p => ({
    name: p.title.length > 34 ? `${p.title.slice(0, 34).trim()}…` : p.title,
    fullTitle: p.title,
    signatures: typeof p.signatures === 'number' ? p.signatures : 0,
  }));
  const topIndex = chartData.reduce((best, d, i) => (d.signatures > (chartData[best]?.signatures ?? -1) ? i : best), 0);
  const chartHeight = Math.max(chartData.length * 44, 120);

  // Recharts renders via inline SVG props, not CSS classes, so it doesn't
  // pick up Tailwind's `dark:` variants automatically — pick literal colors
  // based on the active theme instead.
  const chartColors = theme === 'dark'
    ? { axis: '#94a3b8', barActive: '#818cf8', barInactive: '#334155', tooltipCursor: '#1e293b', tooltipBg: '#1e293b', tooltipText: '#e2e8f0' }
    : { axis: '#475569', barActive: '#4f46e5', barInactive: '#e2e8f0', tooltipCursor: '#f8fafc', tooltipBg: '#ffffff', tooltipText: '#1e293b' };

  return (
    <div className="max-w-[1600px] mx-auto p-4 md:p-8">
      <div className="mb-10 text-center md:text-left">
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold uppercase tracking-wider mb-4">
             <ScrollText className="w-3.5 h-3.5" />
             Parliament Live
        </div>
        <h2 className="text-3xl md:text-4xl font-extrabold text-slate-900 dark:text-slate-100 tracking-tight">Active Petitions</h2>
        <p className="text-lg text-slate-500 dark:text-slate-400 mt-2 font-light">Track the public voice on immigration policy changes.</p>
      </div>

      <div className="mb-12">
        {/* Engagement Chart */}
        <div className="bg-white dark:bg-slate-900 p-6 md:p-8 rounded-3xl border border-slate-200 dark:border-slate-700 shadow-sm dark:shadow-black/30 relative overflow-hidden group">
          <div className="flex items-center justify-between mb-8">
            <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100">Top Petitions by Signatures</h3>
                    <p className="text-xs text-slate-400 dark:text-slate-500">Live from UK Parliament</p>
                </div>
            </div>
            <span className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {totalSignatures >= 1000 ? `${(totalSignatures / 1000).toFixed(1)}k` : totalSignatures}
            </span>
          </div>

          <div className="relative z-10" style={{ height: chartData.length > 0 ? chartHeight : 256 }}>
            {chartData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 56, bottom: 4, left: 4 }}
                  barCategoryGap={12}
                >
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    axisLine={false}
                    tickLine={false}
                    width={220}
                    tick={{ fill: chartColors.axis, fontSize: 12.5, fontWeight: 500 }}
                  />
                  <Tooltip
                    cursor={{ fill: chartColors.tooltipCursor }}
                    contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)', backgroundColor: chartColors.tooltipBg }}
                    itemStyle={{ color: chartColors.tooltipText, fontWeight: 600 }}
                    labelFormatter={(_label, payload) => payload?.[0]?.payload?.fullTitle || _label}
                    formatter={(value: number) => [value.toLocaleString(), 'Signatures']}
                  />
                  <Bar dataKey="signatures" radius={[0, 4, 4, 0]} barSize={22}>
                      {chartData.map((_entry, index) => (
                          <Cell key={`cell-${index}`} fill={index === topIndex ? chartColors.barActive : chartColors.barInactive} />
                      ))}
                      <LabelList
                        dataKey="signatures"
                        position="right"
                        formatter={(value: number) => value.toLocaleString()}
                        style={{ fill: chartColors.axis, fontSize: 12, fontWeight: 700 }}
                      />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center text-sm text-slate-400 dark:text-slate-500">
                {loading ? 'Loading live petition data…' : 'No petition data available.'}
              </div>
            )}
          </div>
        </div>
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
                {petitions.map((petition) => (
                    <a
                        key={petition.id}
                        href={petition.url}
                        target="_blank"
                        rel="noreferrer"
                        className="bg-white dark:bg-slate-900 rounded-2xl p-6 border border-slate-200 dark:border-slate-700 shadow-[0_2px_12px_rgba(0,0,0,0.03)] dark:shadow-[0_2px_12px_rgba(0,0,0,0.3)] hover:shadow-[0_8px_24px_rgba(0,0,0,0.06)] dark:hover:shadow-[0_8px_24px_rgba(0,0,0,0.4)] hover:border-indigo-200 dark:hover:border-indigo-700 transition-all group flex flex-col h-full">
                        <div className="flex justify-between items-start mb-4">
                            <span className={`px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border
                                ${petition.status.toLowerCase().includes('open') ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40' :
                                  petition.status.toLowerCase().includes('debate') ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40' :
                                  'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'}`}>
                                {petition.status}
                            </span>
                            <PenTool className="w-4 h-4 text-slate-300 group-hover:text-indigo-500 transition-colors dark:text-slate-600 dark:group-hover:text-indigo-400" />
                        </div>

                        <h4 className="text-lg font-bold text-slate-900 mb-2 line-clamp-2 leading-tight group-hover:text-indigo-700 transition-colors dark:text-slate-100 dark:group-hover:text-indigo-400">
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
                                    className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full transition-all duration-1000"
                                    style={{ width: `${getProgressWidth(petition.signatures)}%` }}
                                ></div>
                             </div>
                        </div>
                    </a>
                ))}
            </div>
        ) : (
            <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 bg-white p-8 rounded-2xl shadow-sm border border-slate-200 leading-relaxed dark:text-slate-400 dark:bg-slate-900 dark:border-slate-700">
                 <AlertCircle className="w-8 h-8 text-slate-300 mb-4 dark:text-slate-600" />
                 <p>No trending immigration petitions found at this time.</p>
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
  );
};