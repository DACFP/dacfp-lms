import type { ReactNode } from 'react';

/**
 * The single gate for dark-build / sandbox vocabulary (brief #17).
 *
 * "Sandbox preview", "synthetic learner data", "dark-build acknowledgment" and
 * friends were scattered as literals across the shell, the auth pages, the
 * terms gate and the lesson copy. Promotion should not be a hunt through JSX
 * for the word "sandbox", so every one of those strings now sits behind this
 * flag and disappears together.
 *
 * Defaults to ON: this repo *is* the dark build, and a missing env var must
 * fail toward disclosure, never toward silently presenting synthetic data as
 * real. Promotion sets VITE_DARK_BUILD=false explicitly.
 */
export const darkBuildEnabled = import.meta.env.VITE_DARK_BUILD !== 'false';

export function DarkBuildOnly({ children }: { children: ReactNode }) {
  return darkBuildEnabled ? <>{children}</> : null;
}

/**
 * For copy that must exist in both builds but read differently — a description
 * prop, an aria-label — where a wrapper cannot help.
 */
export function darkBuildCopy(sandbox: string, production: string) {
  return darkBuildEnabled ? sandbox : production;
}
