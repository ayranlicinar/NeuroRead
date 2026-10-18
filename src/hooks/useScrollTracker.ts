import { useEffect, useRef, useState, type RefObject } from 'react';

/**
 * Tracks scrolling inside the reader. Only timestamps and a progress ratio are
 * kept in memory; nothing about scrolling is stored or sent anywhere.
 */
export function useScrollTracker(ref: RefObject<HTMLElement | null>, deps: unknown[]) {
  const lastScrollAt = useRef<number | null>(null);
  const [progress, setProgress] = useState(0);
  const [needsScroll, setNeedsScroll] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const measure = () => {
      const max = el.scrollHeight - el.clientHeight;
      setNeedsScroll(max > 40);
      setProgress(max > 0 ? Math.min(1, el.scrollTop / max) : 0);
    };
    const onScroll = () => {
      lastScrollAt.current = Date.now();
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(measure) : null;
    ro?.observe(el);
    if (el.firstElementChild) ro?.observe(el.firstElementChild);
    measure();
    return () => {
      el.removeEventListener('scroll', onScroll);
      ro?.disconnect();
      cancelAnimationFrame(raf);
    };
  }, deps);

  return { lastScrollAt, progress, needsScroll };
}
