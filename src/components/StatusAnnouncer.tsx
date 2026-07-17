import { useCallback, useRef, useState } from 'react';

/**
 * Assertive live region (brief #3).
 *
 * Rendered unconditionally by its owner and updated by message, never mounted
 * on demand: a live region has to be in the accessibility tree *before* its
 * content changes, or the change is not announced. Mounting a region and
 * filling it in the same commit is the classic reason verdicts go silent.
 */
export function StatusAnnouncer({ message }: { message: string }) {
  return (
    <div
      aria-live="assertive"
      aria-atomic="true"
      className="sr-only"
      data-slot="status-announcer"
    >
      {message}
    </div>
  );
}

/**
 * Live-region + focus-move plumbing (brief #3).
 *
 * `announce` updates the region. `announceAndFocus` additionally moves focus to
 * `targetRef` after paint, which is how a quiz verdict reaches both a screen
 * reader (via the region) and a keyboard user (via focus) without the caller
 * hand-rolling either half.
 *
 * Consumed by the quiz verdict in O2 per SPEC-OVERHAUL.md §2.
 */
export function useStatusAnnouncer<T extends HTMLElement = HTMLElement>() {
  const [message, setMessage] = useState('');
  const targetRef = useRef<T>(null);

  const announce = useCallback((text: string) => {
    setMessage(text);
  }, []);

  const focusTarget = useCallback(() => {
    targetRef.current?.focus();
  }, []);

  const announceAndFocus = useCallback((text: string) => {
    setMessage(text);
    // After paint: the result element frequently does not exist until the
    // commit that this same message triggers.
    requestAnimationFrame(() => {
      targetRef.current?.focus();
    });
  }, []);

  const clear = useCallback(() => {
    setMessage('');
  }, []);

  return { message, announce, announceAndFocus, focusTarget, clear, targetRef };
}
