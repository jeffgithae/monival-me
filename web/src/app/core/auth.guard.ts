import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

export const authGuard: CanActivateFn = () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  if (auth.isLoggedIn) {
    return true;
  }
  return router.createUrlTree(['/login']);
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
  return router.createUrlTree(['/dashboard']);
};