import { inject } from '@angular/core';
import { CanActivateChildFn, CanActivateFn, Router } from '@angular/router';
import { catchError, map, of } from 'rxjs';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) {
    return router.createUrlTree(['/login']);
  }
  // Wait for the profile before rendering: pages read the user's role when
  // they are constructed, and on a hard refresh it has not arrived yet — which
  // silently hid every role-gated button. If the profile request fails the
  // service drops the session, so fall back to whatever state that leaves.
  return auth.ensureProfile().pipe(
    map(() => true as const),
    catchError(() => of(auth.isLoggedIn ? true : router.createUrlTree(['/login']))),
  );
};

// Pages every signed-in user has, whatever their menu.
const ALWAYS_ALLOWED = ['/dashboard', '/profile'];
// Detail pages that live under another page's menu entry.
const PARENT_ROUTE: Record<string, string> = { '/indicators': '/projects' };

/**
 * Keeps each role to the pages its menu offers. The API already refuses the
 * data, but without this a typed or bookmarked URL rendered the page shell
 * around a set of failed requests. The server-computed menu is the single
 * definition of who sees what.
 */
export const roleGuard: CanActivateChildFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const path = state.url.split(/[?#]/)[0];
  const under = (base: string) => path === base || path.startsWith(base + '/');
  if (ALWAYS_ALLOWED.some(under)) return true;

  return auth.ensureNavMenu().pipe(
    map((menu) => {
      const parent = Object.entries(PARENT_ROUTE).find(([prefix]) => under(prefix))?.[1];
      const allowed = menu.some((item) => under(item.route) || item.route === parent);
      return allowed ? true : router.createUrlTree(['/dashboard']);
    }),
    // If the menu cannot be loaded, let the page through: the API still enforces access.
    catchError(() => of(true as const)),
  );
};

export const guestGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (!auth.isLoggedIn) {
    return true;
  }
  // Special case: a logged-in user clicking an invite link for a different
  // organisation should not be silently bounced to their current dashboard
  // with the invite token discarded. Let them through so AcceptInviteComponent
  // can check whether the invite email matches their account and respond
  // accordingly (offer to switch, or explain the mismatch) rather than the
  // invite simply appearing broken.
  if (state.url.startsWith('/accept-invite')) {
    return true;
  }
  // A logged-in user may legitimately need /register: they created an
  // account but never finished workspace setup. The register page checks
  // the profile and bounces users who already have an organisation.
  if (state.url.startsWith('/register')) {
    return true;
  }
  return router.createUrlTree(['/dashboard']);
};