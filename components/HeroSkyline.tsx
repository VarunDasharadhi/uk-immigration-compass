import { FC } from 'react';

/**
 * Decorative Westminster skyline silhouette for the hero section — Elizabeth
 * Tower ("Big Ben", with a softly glowing clock face), Portcullis House's
 * chimneys, and generic riverside blocks. Pinned to the bottom edge and
 * centred so the tower stays in frame on narrow screens. Purely decorative:
 * aria-hidden, pointer-events disabled.
 */
export const HeroSkyline: FC = () => (
  <div
    className="absolute inset-x-0 bottom-0 flex justify-center overflow-hidden pointer-events-none select-none"
    aria-hidden="true"
  >
    <svg
      className="block h-auto w-[760px] max-w-none lg:w-full fill-white/[0.07]"
      viewBox="0 0 1440 240"
      preserveAspectRatio="xMidYMax meet"
    >
      {/* Left riverside blocks */}
      <rect x="-20" y="150" width="140" height="90" />
      <rect x="130" y="176" width="88" height="64" />
      {/* Portcullis House — three chimneys over a long roof */}
      <rect x="228" y="180" width="170" height="60" />
      <rect x="240" y="140" width="18" height="44" />
      <rect x="304" y="128" width="18" height="56" />
      <rect x="368" y="140" width="18" height="44" />
      {/* Elizabeth Tower — Big Ben */}
      <rect x="432" y="118" width="96" height="122" />
      <rect x="424" y="66" width="112" height="52" />
      <path d="M424 66 L480 4 L536 66 Z" />
      <rect x="477" y="0" width="6" height="10" />
      {/* The glowing clock face */}
      <circle cx="480" cy="92" r="19" className="fill-indigo-300/25" />
      {/* Middle blocks and a church tower */}
      <rect x="560" y="190" width="120" height="50" />
      <rect x="700" y="158" width="100" height="82" />
      <rect x="818" y="120" width="44" height="120" />
      <path d="M812 120 L860 120 L836 92 Z" />
      <rect x="880" y="182" width="140" height="58" />
      {/* Right cluster */}
      <rect x="1040" y="168" width="112" height="72" />
      <rect x="1168" y="198" width="140" height="42" />
      <rect x="1226" y="152" width="14" height="50" />
      <rect x="1330" y="176" width="130" height="64" />
    </svg>
  </div>
);
