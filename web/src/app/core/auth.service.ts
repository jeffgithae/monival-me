import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment.prod';
import { AuthUser, NavItem, Organization } from './models';

interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  user: AuthUser;
}

interface MeResponse extends AuthUser {
  role: AuthUser['role'];
  organization: Organization | null;
}

interface RegisterResponse extends AuthResponse {
  selectedPlan?: string;
  checkoutRequired?: boolean;
  checkout?: { url: string; mock?: boolean };
}

const TOKEN_KEY = 'evidara_token';
const REFRESH_TOKEN_KEY = 'evidara_refresh_token';
const NAV_CACHE_KEY = 'evidara_nav_cache';
const NAV_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable({ providedIn: 'root' })
export class AuthService {
  isOwner() { return this.user()?.role === 'owner'; }
  isAdmin() { return this.user()?.role === 'admin'; }
  isFinance() { return this.user()?.role === 'finance'; }
  isMEOfficer() { return this.user()?.role === 'me_officer'; }

  readonly user = signal<AuthUser | null>(null);
  readonly organization = signal<Organization | null>(null);
  readonly navMenu = signal<NavItem[]>([]);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    const token = localStorage.getItem(TOKEN_KEY);
    if (token) {
      // Restore cached nav immediately to avoid flash
      this.restoreNavCache();
      this.loadProfile().subscribe({
        error: () => {
          localStorage.removeItem(TOKEN_KEY);
          localStorage.removeItem(REFRESH_TOKEN_KEY);
          this.user.set(null);
          this.organization.set(null);
        },
      });
    }
  }

  get token(): string | null { return localStorage.getItem(TOKEN_KEY); }
  get refreshToken(): string | null { return localStorage.getItem(REFRESH_TOKEN_KEY); }
  get isLoggedIn(): boolean { return !!this.token; }

  register(payload: {
    email: string; password: string; name: string;
    organizationName: string; country?: string; sector?: string; planId?: string;
  }) {
    return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register`, payload);
  }

  /**
   * Create an account for an invited user. Org details and the account's
   * email come entirely from the invite (resolved server-side from the
   * token) — never collected again on this form.
   */
  registerInvited(payload: { name: string; password: string; token: string }) {
    return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register-invited`, payload);
  }

  completeRegistration(res: RegisterResponse, navigate = true) {
    this.setSession(res, navigate);
  }

  login(email: string, password: string) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(tap(res => this.setSession(res)));
  }

  googleLogin(idToken: string) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/google`, {
        idToken
      })
      .pipe(tap(res => this.setSession(res)));
  }

  forgotPassword(email: string) {
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/auth/forgot-password`, { email: email.trim().toLowerCase() });
  }

  resetPassword(token: string, newPassword: string) {
    return this.http.post<{ success: boolean }>(`${environment.apiUrl}/auth/reset-password`, { token, newPassword });
  }

  logout() {
    // Tell server to revoke the refresh token (fire-and-forget)
    if (this.token) {
      this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ error: () => { } });
    }
    this.clearSession();
    void this.router.navigate(['/login']);
  }

  /**
   * Same effect as logout() but without the redirect to /login — for flows
   * that need to drop the current session and immediately continue on the
   * current page (e.g. accept-invite re-checking as a guest after the user
   * chooses to switch accounts).
   */
  clearSessionOnly() {
    if (this.token) {
      this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({ error: () => { } });
    }
    this.clearSession();
  }

  loadProfile() {
    return this.http.get<MeResponse>(`${environment.apiUrl}/auth/me`).pipe(
      tap(profile => {
        this.user.set({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          organizationId: profile.organizationId,
          role: profile.role,
        });
        this.organization.set(profile.organization);
        this.loadNavMenu();
      }),
    );
  }

  /**
   * Load the server-computed navigation menu with a 5-minute localStorage cache.
   * Avoids a network round-trip on every page refresh.
   */
  private loadNavMenu(forceRefresh = false) {
    if (!forceRefresh) {
      const cached = this.getNavCache();
      if (cached) {
        this.navMenu.set(cached);
        return;
      }
    }

    this.http.get<NavItem[]>(`${environment.apiUrl}/auth/menu`).subscribe({
      next: items => {
        this.navMenu.set(items);
        this.setNavCache(items);
      },
      error: () => { },
    });
  }

  /** Call after role/plan changes to bust the nav cache */
  refreshNavMenu() {
    localStorage.removeItem(NAV_CACHE_KEY);
    this.loadNavMenu(true);
  }

  private getNavCache(): NavItem[] | null {
    try {
      const raw = localStorage.getItem(NAV_CACHE_KEY);
      if (!raw) return null;
      const { items, expiresAt } = JSON.parse(raw) as { items: NavItem[]; expiresAt: number };
      if (Date.now() > expiresAt) {
        localStorage.removeItem(NAV_CACHE_KEY);
        return null;
      }
      return items;
    } catch {
      return null;
    }
  }

  private setNavCache(items: NavItem[]) {
    try {
      localStorage.setItem(NAV_CACHE_KEY, JSON.stringify({
        items,
        expiresAt: Date.now() + NAV_CACHE_TTL_MS,
      }));
    } catch {
      // localStorage quota exceeded — skip caching
    }
  }

  private restoreNavCache() {
    const cached = this.getNavCache();
    if (cached) this.navMenu.set(cached);
  }

  private setSession(res: AuthResponse, navigate = true) {
    localStorage.setItem(TOKEN_KEY, res.accessToken);
    if (res.refreshToken) {
      localStorage.setItem(REFRESH_TOKEN_KEY, res.refreshToken);
    }
    this.user.set(res.user);
    if (navigate) {
      void this.router.navigate(['/dashboard']);
    }
    this.loadProfile().subscribe();
  }

  private clearSession() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    localStorage.removeItem(NAV_CACHE_KEY);
    this.user.set(null);
    this.organization.set(null);
    this.navMenu.set([]);
  }
}