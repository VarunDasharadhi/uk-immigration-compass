import { FC, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { PetitionItem } from '../types';
import { X, ExternalLink, Milestone, Users, PenTool, TrendingUp, CalendarClock } from 'lucide-react';

interface PetitionDetailModalProps {
  petition: PetitionItem;
  onClose: () => void;
}

const numeric = (v: string | number) =>
  typeof v === 'number' ? v : parseInt(String(v).replace(/[^0-9]/g, '')) || 0;

/**
 * Full-detail view for one petition, structured exactly like the news detail
 * modal: title band, analysis column with impact cards, and a sidebar column
 * carrying the petition's journey timeline plus the Parliament link.
 */
export const PetitionDetailModal: FC<PetitionDetailModalProps> = ({ petition, onClose }) => {
  const sig = numeric(petition.signatures);
  const pct = Math.min((sig / 100000) * 100, 100);
  const hit10k = sig >= 10000;
  const hit100k = sig >= 100000;
  const wembleyFill = sig / 90000;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [onClose]);

  const nextStep = hit100k
    ? 'The Petitions Committee will consider this petition for a debate in Parliament. Timing is decided by the Backbench Business Committee.'
    : hit10k
      ? `The government has responded. Another ${(100000 - sig).toLocaleString()} signatures would see it considered for a Commons debate.`
      : `${(10000 - sig).toLocaleString()} more signatures will force a government response.`;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/70 backdrop-blur-md" onClick={onClose} />

      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-20 dark:bg-slate-800 dark:hover:bg-slate-700"
          aria-label="Close"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>

        <div className="flex-1 overflow-y-auto custom-scrollbar">
          {/* Title block — same band as the news modal */}
          <div className="p-8 sm:p-10 pb-6 border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <span className={`px-3 py-1 text-[11px] font-bold uppercase tracking-wider rounded-md border ${
                petition.status.toLowerCase().includes('open')
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-900/40'
                  : petition.status.toLowerCase().includes('debate')
                    ? 'bg-purple-50 text-purple-700 border-purple-100 dark:bg-purple-950/40 dark:text-purple-300 dark:border-purple-900/40'
                    : 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700'
              }`}>
                {petition.status}
              </span>
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Users className="w-4 h-4" />
                {sig.toLocaleString()} signatures
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight pr-8">
              {petition.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 sm:p-10">
            {/* Main Content (2 cols) */}
            <div className="md:col-span-2 space-y-8">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <PenTool className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> The petition
                </h4>
                <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                  <p>{petition.summary}</p>
                </div>
              </div>

              {/* Impact cards — same pair as the news modal */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40">
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <TrendingUp className="w-4 h-4" /> Public support
                  </h4>
                  <p className="text-amber-800 dark:text-amber-300 font-medium text-sm leading-relaxed">
                    {sig.toLocaleString()} people have signed
                    {wembleyFill >= 1
                      ? `, a crowd that would fill Wembley Stadium ${wembleyFill.toFixed(1)} times`
                      : ''}.
                  </p>
                </div>
                <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/40">
                  <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <CalendarClock className="w-4 h-4" /> What happens next?
                  </h4>
                  <p className="text-blue-800 dark:text-blue-300 font-medium text-sm leading-relaxed">{nextStep}</p>
                </div>
              </div>

              {/* Parliament link — mirrors the news modal's official-sources block */}
              {petition.url && (
                <div className="border-t border-slate-100 dark:border-slate-800 pt-8">
                  <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-4 flex items-center gap-2">
                    <ExternalLink className="w-4 h-4 text-indigo-500 dark:text-indigo-400" /> On Parliament's site
                  </h4>
                  <a
                    href={petition.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-gradient-to-r from-blue-600 to-cyan-500 text-white rounded-xl font-semibold hover:from-blue-500 hover:to-cyan-400 transition-all shadow-lg shadow-blue-500/30 w-full"
                  >
                    <ExternalLink className="w-4 h-4" />
                    View or sign this petition
                  </a>
                </div>
              )}
            </div>

            {/* Journey Sidebar (1 col) — mirrors the news modal's Policy Timeline */}
            <div className="md:col-span-1 border-l border-slate-100 dark:border-slate-800 md:pl-8">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-6 flex items-center gap-2">
                <Milestone className="w-4 h-4 text-sky-600 dark:text-sky-400" /> Petition journey
              </h4>

              <div className="relative space-y-10">
                <div className="absolute top-2 left-[5px] bottom-2 w-0.5 bg-slate-100 dark:bg-slate-700"></div>

                <div className="relative pl-6">
                  <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-slate-300 bg-slate-300 dark:border-slate-600 dark:bg-slate-600"></div>
                  <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mb-0.5">Opened</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">Live on the UK Parliament petitions site</p>
                </div>

                <div className="relative pl-6">
                  <div className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                    hit10k
                      ? 'border-emerald-500 bg-emerald-500 ring-4 ring-emerald-50 dark:ring-emerald-950/40'
                      : 'border-slate-300 bg-slate-300 dark:border-slate-600 dark:bg-slate-600'
                  }`}></div>
                  <span className={`text-xs font-bold block mb-0.5 ${hit10k ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400 dark:text-slate-500'}`}>10,000 signatures</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                    {hit10k ? 'Government response earned' : 'Government must respond'}
                  </p>
                </div>

                <div className="relative pl-6">
                  <div className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 ${
                    hit100k
                      ? 'border-blue-600 bg-blue-600 ring-4 ring-blue-50 dark:ring-blue-950/40'
                      : 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                  }`}></div>
                  <span className={`text-xs font-bold block mb-0.5 ${hit100k ? 'text-blue-600 dark:text-blue-400' : 'text-slate-400 dark:text-slate-500'}`}>100,000 signatures</span>
                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">
                    {hit100k ? 'Debate threshold reached' : 'Considered for a Commons debate'}
                  </p>
                </div>

                {/* Progress within the current stage */}
                <div className="relative pl-6 pt-2">
                  <div className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">Right now</div>
                  <div className="h-2 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(pct, 1.5)}%` }}
                    />
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2">{Math.floor(pct)}% of the way to 100,000</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
