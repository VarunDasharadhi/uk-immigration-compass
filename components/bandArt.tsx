import React from 'react';

/**
 * Themed silhouette artwork for the dark title bands. Each is bottom-anchored
 * and drawn to sit at very low opacity behind band content. Purely
 * decorative: aria-hidden, pointer-events disabled.
 */

const frame = 'block h-full w-full';

export const SponsorsArt: React.FC = () => (
  <svg className={frame} viewBox="0 0 480 240" preserveAspectRatio="xMidYMax meet" fill="currentColor" aria-hidden="true">
    {/* City of offices — the register made physical */}
    <rect x="16" y="140" width="72" height="100" />
    <rect x="98" y="110" width="64" height="130" />
    <rect x="172" y="156" width="86" height="84" />
    <rect x="268" y="96" width="74" height="144" />
    <rect x="352" y="136" width="62" height="104" />
    <rect x="424" y="166" width="56" height="74" />
    {/* rooftop antenna on the tallest block */}
    <rect x="302" y="72" width="5" height="26" />
  </svg>
);

export const PetitionsArt: React.FC = () => (
  <svg className={frame} viewBox="0 0 480 240" preserveAspectRatio="xMidYMax meet" fill="currentColor" aria-hidden="true">
    {/* A crowd of signatories, head and shoulders */}
    <circle cx="52" cy="148" r="21" />
    <path d="M18 240 v-44 a34 34 0 0 1 68 0 v44 z" />
    <circle cx="148" cy="136" r="23" />
    <path d="M112 240 v-48 a36 36 0 0 1 72 0 v48 z" />
    <circle cx="243" cy="150" r="20" />
    <path d="M210 240 v-40 a33 33 0 0 1 66 0 v40 z" />
    <circle cx="338" cy="138" r="22" />
    <path d="M303 240 v-46 a35 35 0 0 1 70 0 v46 z" />
    <circle cx="428" cy="150" r="19" />
    <path d="M396 240 v-38 a32 32 0 0 1 64 0 v38 z" />
  </svg>
);

export const JargonArt: React.FC = () => (
  <svg className={frame} viewBox="0 0 480 240" preserveAspectRatio="xMidYMax meet" fill="none" stroke="currentColor" aria-hidden="true">
    {/* Official letter being translated: two documents, plain-English lines */}
    <g strokeWidth="7">
      <rect x="60" y="30" width="130" height="180" rx="10" />
      <path d="M90 70h70 M90 100h70 M90 130h46" strokeLinecap="round" />
      <rect x="270" y="60" width="130" height="160" rx="10" />
      <path d="M300 104h70 M300 134h70 M300 164h46" strokeLinecap="round" />
    </g>
    {/* The translation arrow between them */}
    <g stroke="none" fill="currentColor">
      <path d="M212 96 l58 24 -58 24 12 -24 z" />
    </g>
  </svg>
);

export const ArchiveArt: React.FC = () => (
  <svg className={frame} viewBox="0 0 480 240" preserveAspectRatio="xMidYMax meet" fill="currentColor" aria-hidden="true">
    {/* Stacked archive drawers */}
    <g>
      <rect x="46" y="96" width="120" height="26" rx="4" />
      <rect x="52" y="122" width="108" height="118" rx="4" />
      <rect x="92" y="140" width="28" height="8" rx="4" />
    </g>
    <g>
      <rect x="196" y="140" width="120" height="26" rx="4" />
      <rect x="202" y="166" width="108" height="74" rx="4" />
      <rect x="242" y="182" width="28" height="8" rx="4" />
    </g>
    <g>
      <rect x="336" y="112" width="120" height="26" rx="4" />
      <rect x="342" y="138" width="108" height="102" rx="4" />
      <rect x="382" y="156" width="28" height="8" rx="4" />
    </g>
  </svg>
);
