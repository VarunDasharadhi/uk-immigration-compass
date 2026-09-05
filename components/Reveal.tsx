import React, { FC, useEffect, useRef, useState } from 'react';

interface RevealProps {
  children: React.ReactNode;
  /** Extra transition delay in ms, useful for staggering cards in a grid. */
  delay?: number;
  className?: string;
}

/**
 * Fades content up into place the first time it scrolls into view. Renders a
 * plain div; children keep their own layout. Users with reduced-motion
 * preferences see the content immediately with no transition.
 */
export const Reveal: FC<RevealProps> = ({ children, delay = 0, className = '' }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    // Environments without IntersectionObserver (jsdom tests, very old
    // browsers) and reduced-motion users both get the content immediately.
    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -40px 0px' }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: `${delay}ms` }}
      className={`transition-all duration-700 ease-out will-change-transform ${
        visible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'
      } ${className}`}
    >
      {children}
    </div>
  );
};
