import {
  HttpErrorResponse,
  HttpInterceptorFn,
  HttpRequest,
  HttpHandlerFn,
} from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError, BehaviorSubject, filter, take } from 'rxjs';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../environments/environment.prod';
import { ToastService } from './toast.service';
const TOKEN_KEY         = 'evidara_token';
const REFRESH_TOKEN_KEY = 'evidara_refresh_token';

/** In-flight refresh gate — prevents parallel refresh calls */
let isRefreshing = false;
const refreshDone$ = new BehaviorSubject<string | null>(null);

/** Messages that should NOT produce a generic toast (handled in-component) */
const SILENT_STATUSES = new Set([422]);

/** Paths that should never be retried with a refresh */
const NO_REFRESH_PATHS = ['/auth/login', '/auth/register', '/auth/refresh'];

function shouldSkipRefresh(url: string) {
  return NO_REFRESH_PATHS.some(p => url.includes(p));
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router  = inject(Router);
  const http    = inject(HttpClient);
  const toaster = inject(ToastService);

  const addAuth = (r: HttpRequest<unknown>) => {
    const token = localStorage.getItem(TOKEN_KEY);
    return token
      ? r.clone({ setHeaders: { Authorization: `Bearer ${token}` } })
      : r;
  };

  return next(addAuth(req)).pipe(
    catchError((err: HttpErrorResponse) => {

      // ── 401 → try token refresh once, then logout ──────────────────────────
      if (err.status === 401 && !shouldSkipRefresh(req.url)) {
        const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);

        if (!refreshToken) {
          localStorage.removeItem(TOKEN_KEY);
          router.navigate(['/login']);
          return throwError(() => err);
        }

        if (!isRefreshing) {
          isRefreshing = true;
          refreshDone$.next(null);

          return http
            .post<{ accessToken: string; refreshToken: string }>(
              `${environment.apiUrl}/auth/refresh`,
              { refreshToken },
            )
            .pipe(
              switchMap(tokens => {
                isRefreshing = false;
                localStorage.setItem(TOKEN_KEY, tokens.accessToken);
                localStorage.setItem(REFRESH_TOKEN_KEY, tokens.refreshToken);
                refreshDone$.next(tokens.accessToken);
                // Retry the original request with the new token
                return next(addAuth(req));
              }),
              catchError(refreshErr => {
                isRefreshing = false;
                refreshDone$.next(null);
                localStorage.removeItem(TOKEN_KEY);
                localStorage.removeItem(REFRESH_TOKEN_KEY);
                router.navigate(['/login']);
                return throwError(() => refreshErr);
              }),
            );
        }

        // Another request already triggered a refresh — wait for it
        return refreshDone$.pipe(
          filter(token => token !== null),
          take(1),
          switchMap(() => next(addAuth(req))),
        );
      }

      // ── 403 ───────────────────────────────────────────────────────────────
      if (err.status === 403) {
        const msg = extractMessage(err) || 'You don\'t have permission to do that.';
        // Subscription/trial expired → redirect to billing instead of generic toast
        if (
          msg.includes('trial has ended') ||
          msg.includes('active subscription is required') ||
          msg.includes('Subscribe in Billing') ||
          msg.includes('Go to Billing')
        ) {
          router.navigate(['/settings/billing']);
          toaster.warning('Your subscription has expired. Please update your billing to continue.');
        } else {
          toaster.warning(msg);
        }
        return throwError(() => err);
      }

      // ── 0 (offline / CORS) ────────────────────────────────────────────────
      if (err.status === 0) {
        toaster.error('Cannot reach the server. Check your connection.');
        return throwError(() => err);
      }

      // ── 5xx server errors ─────────────────────────────────────────────────
      if (err.status >= 500) {
        toaster.error('Server error. Please try again in a moment.');
        return throwError(() => err);
      }

      // ── 4xx client errors (not 401/403) — show message unless silent ──────
      if (!SILENT_STATUSES.has(err.status) && err.status >= 400) {
        const msg = extractMessage(err);
        if (msg) toaster.error(msg, 6000);
      }

      return throwError(() => err);
    }),
  );
};

function extractMessage(err: HttpErrorResponse): string {
  const body = err.error as { message?: string | string[] } | null;
  const msg = body?.message;
  if (Array.isArray(msg)) return msg.join('. ');
  if (typeof msg === 'string') return msg;
  return '';
}