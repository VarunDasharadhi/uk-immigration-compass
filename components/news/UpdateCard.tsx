import React from 'react';
import { NewsItem } from '../../types';
import { CategoryIcon, StatusBadge } from './newsShared';
import { Clock, ArrowRight, CalendarDays } from 'lucide-react';

interface UpdateCardProps {
  item: NewsItem;
  onClick: () => void;
}

export const UpdateCard: React.FC<UpdateCardProps> = ({ item, onClick }) => {
  return (
    <article
      onClick={onClick}
      className="group bg-white rounded-2xl p-6 sm:p-7 shadow-[0_2px_8px_rgba(0,0,0,0.04)] hover:shadow-[0_12px_24px_rgba(0,0,0,0.06)] border border-slate-200/60 hover:border-blue-500/30 transition-all duration-300 relative overflow-hidden flex flex-col h-full cursor-pointer"
    >
      {/* Decorative top border */}
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-slate-200 to-transparent group-hover:via-blue-500 transition-all duration-500"></div>

      {/* Card Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-slate-50 border border-slate-100 group-hover:bg-white group-hover:shadow-sm transition-all">
            <CategoryIcon category={item.category} />
          </div>
          <div className="flex flex-col">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">{item.category}</span>
            <span className="text-xs font-medium text-slate-500 flex items-center gap-1">
              <Clock className="w-3 h-3" /> {item.date}
            </span>
          </div>
        </div>
        <div className="group-hover:scale-105 transition-transform">
          <StatusBadge status={item.status} />
        </div>
      </div>

      {/* Title & Summary */}
      <h3 className="text-xl sm:text-2xl font-bold text-slate-900 mb-3 leading-tight group-hover:text-blue-700 transition-colors break-words">
        {item.title}
      </h3>
      <p className="text-slate-600 leading-relaxed text-[15px] mb-6 border-l-2 border-slate-100 pl-4 flex-grow">
        {item.summary}
      </p>

      {/* Actionable Footer Grid */}
      <div className="grid sm:grid-cols-2 gap-4 mt-auto">
        <div className="bg-slate-50/50 rounded-xl p-4 border border-slate-100 hover:bg-slate-50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-amber-500"></div>
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wide">Impact</h4>
          </div>
          <p className="text-sm font-medium text-slate-800 leading-snug">{item.impact}</p>
        </div>
        <div className="bg-blue-50/30 rounded-xl p-4 border border-blue-100/50 hover:bg-blue-50/50 transition-colors">
          <div className="flex items-center gap-2 mb-2">
            <CalendarDays className="w-3.5 h-3.5 text-blue-600" />
            <h4 className="text-xs font-bold text-blue-600 uppercase tracking-wide">Timeline</h4>
          </div>
          <p className="text-sm font-medium text-slate-800 leading-snug">{item.nextSteps}</p>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-blue-600 font-semibold text-sm opacity-0 group-hover:opacity-100 transition-opacity translate-y-2 group-hover:translate-y-0 duration-300">
        View full timeline & analysis <ArrowRight className="w-4 h-4" />
      </div>
    </article>
  );
};
