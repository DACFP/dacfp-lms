import type { LmsAuthSession } from '../data/provider';

export type ActorRole = LmsAuthSession['user']['role'];

export interface AuthRedirectState {
  from?: string;
  actor?: ActorRole;
}

const learnerExactRoutes = new Set([
  '/',
  '/dashboard',
  '/account',
  '/credentials',
  '/certificate',
]);

const learnerRoutePrefixes = ['/course/', '/lesson/', '/quiz/', '/completion/'];

function pathnameOf(candidate: string) {
  if (!candidate.startsWith('/') || candidate.startsWith('//')) return null;
  try {
    return new URL(candidate, 'https://lms.invalid').pathname;
  } catch {
    return null;
  }
}

export function roleHome(role: ActorRole) {
  return role === 'operator' ? '/admin' : '/';
}

export function isPermittedReturnPath(role: ActorRole, candidate: string) {
  const pathname = pathnameOf(candidate);
  if (!pathname) return false;
  if (role === 'operator') return pathname === '/admin' || pathname.startsWith('/admin/');
  return (
    learnerExactRoutes.has(pathname) ||
    learnerRoutePrefixes.some((prefix) => pathname.startsWith(prefix))
  );
}

export function destinationAfterAuth(
  role: ActorRole,
  redirect: AuthRedirectState | null | undefined,
) {
  return redirect?.actor === role &&
    redirect.from &&
    isPermittedReturnPath(role, redirect.from)
    ? redirect.from
    : roleHome(role);
}
