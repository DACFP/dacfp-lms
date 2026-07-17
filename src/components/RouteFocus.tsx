import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/**
 * Route-change focus (brief #11).
 *
 * A client-side route change swaps the whole main region but leaves focus
 * wherever the activating link was — so keyboard and screen-reader users land
 * on the *previous* page's chrome and have to hunt for the new content. On
 * every pathname change this moves focus to #main-content, which each shell
 * exposes as tabIndex={-1}.
 *
 * Skips the initial mount: on first paint focus is already at the document
 * start, and stealing it would fight the skip link.
 */
export function RouteFocus() {
  const { pathname } = useLocation();
  const isInitialRender = useRef(true);

  useEffect(() => {
    if (isInitialRender.current) {
      isInitialRender.current = false;
      return;
    }
    // After paint: the destination shell's #main-content does not exist until
    // the commit this navigation causes.
    const frame = requestAnimationFrame(() => {
      document.getElementById('main-content')?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [pathname]);

  return null;
}
