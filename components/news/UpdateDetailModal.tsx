import React from 'react';
import { createPortal } from 'react-dom';
import { NewsItem, GroundingChunk } from '../../types';
import { StatusBadge, parseTimeline, getPrimaryLink } from './newsShared';
import {
  ExternalLink, Clock, Activity, GitCommitVertical, X, Link as LinkIcon,
} from 'lucide-react';

interface UpdateDetailModalProps {
  item: NewsItem;
  officialSources: GroundingChunk[];
  onClose: () => void;
}

// Rendered via a portal to document.body so its z-index isn't capped by
// <main>'s own stacking context (App.tsx's <main> has "relative z-10", which
// otherwise caps this modal below the header's "sticky z-50" regardless of
// the modal's own z-index).
export const UpdateDetailModal: React.FC<UpdateDetailModalProps> = ({ item, officialSources, onClose }) => {
  const timelineEvents = parseTimeline(item.timeline);
  const primary = getPrimaryLink(item, officialSources);

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-slate-900/70 backdrop-blur-md transition-opacity"
        onClick={onClose}
      ></div>

      {/* Modal Container */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-4xl max-h-[90vh] flex flex-col relative z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-full transition-colors z-20 dark:bg-slate-800 dark:hover:bg-slate-700"
        >
          <X className="w-5 h-5 text-slate-600 dark:text-slate-300" />
        </button>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto custom-scrollbar">
          <div className="p-8 sm:p-10 pb-6 border-b border-slate-100 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/50">
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <StatusBadge status={item.status} large />
              <span className="text-sm font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Clock className="w-4 h-4" /> {item.date}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
              {item.title}
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8 p-8 sm:p-10">
            {/* Main Content (2 cols) */}
            <div className="md:col-span-2 space-y-8">
              <div>
                <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-3 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600 dark:text-blue-400" /> Analysis & Context
                </h4>
                <div className="prose prose-slate dark:prose-invert max-w-none text-slate-600 dark:text-slate-400 leading-relaxed text-lg">
                  <p>{item.details}</p>
                </div>
              </div>

              {/* Impact Cards */}
              <div className="grid sm:grid-cols-2 gap-4">
                <div className="bg-amber-50 rounded-2xl p-6 border border-amber-100 dark:bg-amber-950/30 dark:border-amber-900/40">
                  <h4 className="text-sm font-bold text-amber-900 dark:text-amber-200 uppercase tracking-wider mb-2">Who is affected?</h4>
                  <p className="text-amber-800 dark:text-amber-300 font-medium text-sm leading-relaxed">{item.impact}</p>
                </div>
                <div className="bg-blue-50 rounded-2xl p-6 border border-blue-100 dark:bg-blue-950/30 dark:border-blue-900/40">
                  <h4 className="text-sm font-bold text-blue-900 dark:text-blue-200 uppercase tracking-wider mb-2">What happens next?</h4>
                  <p className="text-blue-800 dark:text-blue-300 font-medium text-sm leading-relaxed">{item.nextSteps}</p>
                </div>
              </div>

              {/* External Links */}
              <div className="border-t border-slate-100 dark:border-slate-800 pt-8">
                <h4 className="text-sm font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-4">Official Sources</h4>

                <div className="mb-6">
                  <a
                    href={primary.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 px-6 py-4 bg-slate-900 text-white rounded-xl font-semibold hover:bg-slate-800 transition-transform hover:-translate-y-0.5 shadow-lg shadow-slate-900/20 w-full"
                  >
                    <ExternalLink className="w-4 h-4" />
                    {primary.label}
                  </a>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2 text-center">
                    Direct link to official Gov.uk content.
                  </p>
                </div>

                {/* Supplementary Sources */}
                <div className="space-y-3">
                  {officialSources.slice(0, 4).map((source, idx) => (
                    <a
                      key={idx}
                      href={source.web?.uri}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-between p-3 rounded-xl bg-white border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group dark:bg-slate-900 dark:border-slate-700 dark:hover:border-blue-600"
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center text-blue-600 flex-shrink-0 dark:bg-blue-950/40 dark:text-blue-400">
                          <LinkIcon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-slate-700 truncate group-hover:text-blue-700 dark:text-slate-300 dark:group-hover:text-blue-400">{source.web?.title}</p>
                          <p className="text-[10px] text-slate-400 dark:text-slate-500 truncate">{source.web?.uri}</p>
                        </div>
                      </div>
                      <ExternalLink className="w-4 h-4 text-slate-300 group-hover:text-blue-500 dark:text-slate-600 dark:group-hover:text-blue-400" />
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {/* Timeline Sidebar (1 col) */}
            <div className="md:col-span-1 border-l border-slate-100 dark:border-slate-800 md:pl-8">
              <h4 className="text-sm font-bold text-slate-900 dark:text-slate-100 uppercase tracking-wider mb-6 flex items-center gap-2">
                <GitCommitVertical className="w-4 h-4 text-purple-600 dark:text-purple-400" /> Policy Timeline
              </h4>

              <div className="relative space-y-8">
                {/* Vertical Line */}
                <div className="absolute top-2 left-[5px] bottom-2 w-0.5 bg-slate-100 dark:bg-slate-700"></div>

                {/* Render extracted timeline events */}
                {timelineEvents.map((event, idx, arr) => (
                  <div key={idx} className="relative pl-6 group">
                    <div className={`absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2
                      ${idx === arr.length - 1 && event.event.toLowerCase().includes('next')
                        ? 'border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900'
                        : 'border-purple-600 bg-purple-600 ring-4 ring-purple-50 dark:ring-purple-950/40'
                      }`}></div>
                    <span className="text-xs font-bold text-purple-600 dark:text-purple-400 block mb-0.5">{event.date}</span>
                    <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">{event.event}</p>
                  </div>
                ))}

                {/* If no timeline parsed, show fallback using date/next steps */}
                {timelineEvents.length === 0 && (
                  <>
                    <div className="relative pl-6">
                      <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-slate-300 bg-slate-300 dark:border-slate-600 dark:bg-slate-600"></div>
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mb-0.5">Previous</span>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-snug">History unavailable</p>
                    </div>
                    <div className="relative pl-6">
                      <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-purple-600 bg-purple-600 ring-4 ring-purple-50 dark:ring-purple-950/40"></div>
                      <span className="text-xs font-bold text-purple-600 dark:text-purple-400 block mb-0.5">{item.date}</span>
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-snug">Initial update received</p>
                    </div>
                    <div className="relative pl-6">
                      <div className="absolute left-[-4px] top-1.5 w-2.5 h-2.5 rounded-full border-2 border-slate-300 bg-white dark:border-slate-600 dark:bg-slate-900"></div>
                      <span className="text-xs font-bold text-slate-400 dark:text-slate-500 block mb-0.5">Next Step</span>
                      <p className="text-sm font-medium text-slate-500 dark:text-slate-400 leading-snug">{item.nextSteps}</p>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
