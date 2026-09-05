import { FC } from 'react';

/**
 * Fixed, full-viewport ambient background: three slowly drifting gradient orbs
 * plus three stacked wave layers looping horizontally at the bottom of the
 * screen. Purely decorative — pointer-events are disabled and the whole layer
 * is hidden from assistive tech. All motion is CSS-only (GPU-friendly
 * transforms) and disabled for users who prefer reduced motion.
 */
export const AnimatedBackground: FC = () => {
  return (
    <div
      className="fixed inset-0 z-0 overflow-hidden pointer-events-none"
      aria-hidden="true"
    >
      {/* Drifting gradient orbs */}
      <div className="orb orb-1 bg-sky-300/45 dark:bg-blue-800/25" />
      <div className="orb orb-2 bg-cyan-200/40 dark:bg-indigo-900/25" />
      <div className="orb orb-3 bg-blue-200/40 dark:bg-sky-900/20" />

      {/* Stacked waves anchored to the bottom edge of the viewport */}
      <div className="absolute inset-x-0 bottom-0 h-[42vh]">
        <div className="wave-track wave-1 text-sky-200/45 dark:text-slate-800/40">
          <WaveGlyph path={WAVE_PATH_A} />
        </div>
        <div className="wave-track wave-2 text-cyan-300/40 dark:text-blue-900/35">
          <WaveGlyph path={WAVE_PATH_B} />
        </div>
        <div className="wave-track wave-3 text-sky-300/55 dark:text-slate-800/55">
          <WaveGlyph path={WAVE_PATH_A} />
        </div>
      </div>
    </div>
  );
};

/**
 * A single seamless wave: the path is drawn twice side by side inside a
 * double-width viewBox so that translating the track by -50% loops without a
 * visible seam. preserveAspectRatio="none" lets the wave stretch to any
 * container height.
 */
const WaveGlyph: FC<{ path: string }> = ({ path }) => (
  <svg
    className="block h-full w-full"
    viewBox="0 0 2880 220"
    preserveAspectRatio="none"
    fill="currentColor"
  >
    <path d={path} />
    <path d={path} transform="translate(1440 0)" />
  </svg>
);

/*
 * Both paths start and end at the same y with the same slope, which is what
 * makes the horizontal loop seamless.
 */
const WAVE_PATH_A =
  'M0,120 C240,60 480,60 720,120 C960,180 1200,180 1440,120 L1440,220 L0,220 Z';
const WAVE_PATH_B =
  'M0,140 C240,190 480,190 720,140 C960,90 1200,90 1440,140 L1440,220 L0,220 Z';
