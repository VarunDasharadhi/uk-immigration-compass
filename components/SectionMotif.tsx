import React, { FC } from 'react';

interface SectionMotifProps {
  icon: React.ComponentType<{ className?: string }>;
  /** Position, size, colour and rotation classes, e.g.
      "-top-10 right-0 w-44 h-44 text-sky-500/10 -rotate-12" */
  className?: string;
}

/**
 * A large, faint topic icon placed inside a section header (the parent needs
 * `relative isolate`) to tie the page visually to its subject. Sits behind
 * the section's text via a negative z-index. Purely decorative.
 */
export const SectionMotif: FC<SectionMotifProps> = ({ icon: Icon, className = '' }) => (
  <Icon
    aria-hidden="true"
    className={`pointer-events-none select-none absolute -z-10 ${className}`}
  />
);
