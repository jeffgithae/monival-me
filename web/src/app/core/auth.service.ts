import { HttpClient } from '@angular/common/http';
import { Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { tap } from 'rxjs/operators';
import { environment } from '../../environments/environment.prod';
import { AuthUser, Organization } from './models';

interface AuthResponse {
  accessToken: string;
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

@Injectable({ providedIn: 'root' })
export class AuthService {
  isOwner() {
    return this.user()?.role === 'owner';
  }

  isAdmin() {
    return this.user()?.role === 'admin';
  }

  isFinance() {
    return this.user()?.role === 'finance';
  }

  isMEOfficer() {
    return this.user()?.role === 'me_officer';
  }

  private readonly tokenKey = 'monival_token';
  readonly user = signal<AuthUser | null>(null);
  readonly organization = signal<Organization | null>(null);

  constructor(
    private readonly http: HttpClient,
    private readonly router: Router,
  ) {
    const token = localStorage.getItem(this.tokenKey);
    if (token) {
      this.loadProfile().subscribe({
        error: () => {
          localStorage.removeItem(this.tokenKey);
          this.user.set(null);
          this.organization.set(null);
        },
      });
    }
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get isLoggedIn(): boolean {
    return !!this.token;
  }

  register(payload: {
    email: string;
    password: string;
    name: string;
    organizationName: string;
    country?: string;
    sector?: string;
    planId?: string;
  }) {
    return this.http.post<RegisterResponse>(`${environment.apiUrl}/auth/register`, payload);
  }

  completeRegistration(res: RegisterResponse, navigate = true) {
    this.setSession(res, navigate);
  }

  login(email: string, password: string) {
    localStorage.removeItem(this.tokenKey);
    return this.http
      .post<AuthResponse>(`${environment.apiUrl}/auth/login`, {
        email: email.trim().toLowerCase(),
        password,
      })
      .pipe(tap((res) => this.setSession(res)));
  }

  loadProfile() {
    return this.http.get<MeResponse>(`${environment.apiUrl}/auth/me`).pipe(
      tap((profile) => {
        this.user.set({
          id: profile.id,
          email: profile.email,
          name: profile.name,
          organizationId: profile.organizationId,
          role: profile.role,
        });
        this.organization.set(profile.organization);
      }),
    );
  }

  logout() {
    localStorage.removeItem(this.tokenKey);
    this.user.set(null);
    this.organization.set(null);
    void this.router.navigate(['/login']);
  }

  private setSession(res: AuthResponse, navigate = true) {
    localStorage.setItem(this.tokenKey, res.accessToken);
    this.user.set(res.user);
    if (navigate) {
      void this.router.navigate(['/dashboard']);
    }
    this.loadProfile().subscribe();
  }
}
