import React from 'react';
import { NewsItem, GroundingChunk } from '../../types';
import { isOfficialUrl } from '../../utils/newsParsing';
import {
  Briefcase, GraduationCap, Heart, Globe, AlertCircle, CheckCircle2, Megaphone, Activity, Zap,
} from 'lucide-react';

export const CATEGORIES = ['All', 'Work', 'Student', 'Family', 'Asylum', 'General'];

export const CategoryIcon: React.FC<{ category: string }> = ({ category }) => {
  const iconClass = 'w-4 h-4';
  switch (category) {
    case 'Work': return <Briefcase className={`${iconClass} text-blue-500`} />;
    case 'Student': return <GraduationCap className={`${iconClass} text-pink-500`} />;
    case 'Family': return <Heart className={`${iconClass} text-rose-500`} />;
    case 'Asylum': return <Globe className={`${iconClass} text-emerald-500`} />;
    default: return <Zap className={`${iconClass} text-amber-500`} />;
  }
};

export const StatusBadge: React.FC<{ status: string; large?: boolean }> = ({ status, large = false }) => {
  const styles: Record<string, string> = {
    Active: 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-100',
    Passed: 'bg-blue-50 text-blue-700 border-blue-200 ring-blue-100',
    Proposed: 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-100',
    Discussion: 'bg-purple-50 text-purple-700 border-purple-200 ring-purple-100',
    Unknown: 'bg-slate-50 text-slate-600 border-slate-200 ring-slate-100',
  };

  const icons: Record<string, any> = {
    Active: CheckCircle2,
    Passed: CheckCircle2,
    Proposed: Activity,
    Discussion: Megaphone,
  };

  const normalizedStatus = Object.keys(styles).find(k => k.toLowerCase() === status.toLowerCase()) || 'Unknown';
  const Icon = icons[normalizedStatus] || AlertCircle;
  const styleClass = styles[normalizedStatus];

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full font-bold uppercase tracking-wider border ring-1 ${styleClass} ${large ? 'px-4 py-1.5 text-xs' : 'px-3 py-1 text-[11px]'}`}>
      <Icon className={large ? 'w-4 h-4' : 'w-3.5 h-3.5'} />
      {status}
    </span>
  );
};

// Helper to parse a "Date: Event; Date: Event" timeline string into entries.
export function parseTimeline(timelineStr: string) {
  if (!timelineStr) return [];
  return timelineStr.split(';').map(t => {
    const parts = t.split(':');
    return {
      date: parts[0]?.trim(),
      event: parts.slice(1).join(':').trim(),
    };
  }).filter(t => t.date && t.event);
}

// REDIRECT LINK STRATEGY
// 1. Direct Deep Link: If the item itself has a specific valid URL, use it.
// 2. Smart Match: Check if any Grounding Source title matches the item title.
// 3. Category Redirect: Fallback to the relevant Gov.uk section page.
// This ensures we NEVER show a 'Search' button, but always a direct 'Redirect'
// to relevant official content. `officialSources` may be empty (e.g. on the
// archive page, where items aren't tied to a specific search's grounding
// metadata) — tier 2 simply finds nothing and falls through to tier 3.
export function getPrimaryLink(item: NewsItem, officialSources: GroundingChunk[]) {
  if (item.sourceUrl && isOfficialUrl(item.sourceUrl) && item.sourceUrl.length > 20) {
    return { url: item.sourceUrl, label: 'View Official Source' };
  }

  const bestMatch = officialSources.find(source => {
    if (!source.web?.title) return false;
    const sourceWords = source.web.title.toLowerCase().split(' ');
    const titleWords = item.title.toLowerCase().split(' ');
    const intersection = sourceWords.filter(element => titleWords.includes(element));
    return intersection.length >= 3;
  });

  if (bestMatch && bestMatch.web?.uri) {
    return { url: bestMatch.web.uri, label: 'View Verified Source' };
  }

  let categoryUrl = 'https://www.gov.uk/browse/visas-immigration';
  switch (item.category) {
    case 'Work': categoryUrl = 'https://www.gov.uk/browse/visas-immigration/work-visas'; break;
    case 'Student': categoryUrl = 'https://www.gov.uk/browse/visas-immigration/student-visas'; break;
    case 'Family': categoryUrl = 'https://www.gov.uk/browse/visas-immigration/family-visas'; break;
    case 'Asylum': categoryUrl = 'https://www.gov.uk/browse/visas-immigration/asylum'; break;
  }

  return { url: categoryUrl, label: 'View Section on Gov.uk' };
}
