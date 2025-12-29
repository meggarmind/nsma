'use client';

import { useState, useEffect } from 'react';

/**
 * Hook to track window focus state
 *
 * Returns true when the window/tab is focused, false when blurred.
 * Useful for adjusting polling intervals or pausing activity when
 * the user isn't actively viewing the page.
 *
 * @returns Whether the window is currently focused
 */
export function useWindowFocus(): boolean {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    // Check initial focus state
    if (typeof document !== 'undefined') {
      setFocused(document.hasFocus());
    }

    const handleFocus = () => setFocused(true);
    const handleBlur = () => setFocused(false);
    const handleVisibilityChange = () => {
      setFocused(document.visibilityState === 'visible');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('blur', handleBlur);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('blur', handleBlur);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  return focused;
}

export default useWindowFocus;
