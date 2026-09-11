import React, { FC } from 'react';
import { SectionMotif } from './SectionMotif';

interface PageHeroProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  /** Small chip rendered above the title, e.g. "Parliament Live". */
  badge?: React.ReactNode;
  children?: React.ReactNode;
}

/**
 * The dark title band every tab opens with, matching the home page hero:
 * white section title, icon tile, and a faint oversized motif, on the same
 * slate-900 band so light mode keeps its dark-anchor rhythm everywhere
 * (white header, dark band, light content, dark footer).
 */
export const PageHero: FC<PageHeroProps> = ({ icon: Icon, title, description, badge, children }) => (
  <section
    className="relative isolate overflow-hidden bg-slate-900 dark:bg-slate-950"
    aria-label={`${title} introduction`}
  >
    {/* Depth gradient behind the band content */}
    <div
      className="absolute inset-0 bg-gradient-to-b from-[#122242] via-slate-900 to-slate-950 pointer-events-none"
      aria-hidden="true"
    />
    <SectionMotif icon={Icon} className="-top-6 right-4 w-48 h-48 text-white/[0.05] rotate-6" />

    <div className="relative max-w-[1600px] mx-auto px-4 sm:px-6 py-12 md:py-16 text-center">
      {badge && (
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/5 border border-white/15 text-blue-300 text-xs font-bold uppercase tracking-wider mb-5">
          {badge}
        </div>
      )}
      <div className="inline-flex items-center justify-center p-3 bg-white/10 ring-1 ring-white/15 rounded-2xl mb-5">
        <Icon className="w-8 h-8 text-blue-300" />
      </div>
      <h2 className="text-3xl md:text-4xl font-extrabold text-white tracking-tight mb-4">
        {title}
      </h2>
      <p className="text-lg text-slate-300 max-w-2xl mx-auto leading-relaxed">
        {description}
      </p>
      {children && <div className="mt-8">{children}</div>}
    </div>
  </section>
);
