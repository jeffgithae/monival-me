import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { LogoComponent } from '../../shared/logo.component';
import { CommonModule } from '@angular/common';

type ViewState = 'loading' | 'register' | 'login' | 'invalid' | 'done' | 'wrong-account';

interface InviteInfo {
  email: string;
  role: string;
  organizationName: string;
  country?: string;
  sector?: string;
  token: string;
}

@Component({
  selector: 'app-accept-invite',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent, CommonModule],
  templateUrl: './accept-invite.component.html',
  styleUrl: './accept-invite.component.scss',
})
export class AcceptInviteComponent implements OnInit {
  view     = signal<ViewState>('loading');
  invite   = signal<InviteInfo | null>(null);
  error    = signal('');
  loading  = signal(false);

  // Register form fields
  name     = '';
  password = '';
  confirm  = '';

  // Login form fields
  loginPassword = '';

  token = '';

  constructor(
    private readonly route:  ActivatedRoute,
    private readonly router: Router,
    private readonly api:    ApiService,
    private readonly auth:   AuthService,
  ) {}

  ngOnInit() {
    this.token = this.route.snapshot.queryParamMap.get('token') ?? '';
    if (!this.token) {
      this.view.set('invalid');
      return;
    }
    this.api.lookupInvite(this.token).subscribe({
      next: (info) => {
        this.invite.set(info);

        // If the visitor is already logged in, decide what to show based
        // on whether their current account matches the invited email —
        // rather than letting guestGuard silently bounce them away with
        // the invite discarded (see auth.guard.ts).
        if (this.auth.isLoggedIn) {
          const currentEmail = this.auth.user()?.email?.toLowerCase();
          if (currentEmail === info.email.toLowerCase()) {
            // Same account — just accept the invite directly, no form needed.
            this.api.acceptInvite(this.token).subscribe({
              next: () => {
                this.view.set('done');
                this.router.navigateByUrl('/dashboard');
              },
              error: (err) => {
                this.error.set(formatHttpError(err, 'Could not accept invitation'));
                this.view.set('invalid');
              },
            });
          } else {
            // Logged in as a different account — don't silently switch them.
            this.view.set('wrong-account');
          }
          return;
        }

        this.view.set('register');
      },
      error: () => {
        this.view.set('invalid');
      },
    });
  }

  get inv(): InviteInfo {
    return this.invite()!;
  }

  /** Used from the wrong-account view: sign out of the current session, then re-check the invite as a guest. */
  logoutAndRetry() {
    this.auth.clearSessionOnly();
    this.view.set('loading');
    this.ngOnInit();
  }

  submitRegister() {
    if (this.password !== this.confirm) {
      this.error.set('Passwords do not match');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters');
      return;
    }
    if (!this.name.trim()) {
      this.error.set('Please enter your name');
      return;
    }

    this.loading.set(true);
    this.error.set('');

    this.auth.registerInvited({
      name: this.name.trim(),
      password: this.password,
      token: this.token,
    }).subscribe({
      next: (res) => {
        this.auth.completeRegistration(res);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        const msg = formatHttpError(err, 'Registration failed');
        // If account exists, suggest logging in
        if (msg.toLowerCase().includes('already exists') || msg.toLowerCase().includes('already registered')) {
          this.error.set('');
          this.view.set('login');
        } else {
          this.error.set(msg);
        }
      },
    });
  }

  submitLogin() {
    if (!this.loginPassword) {
      this.error.set('Please enter your password');
      return;
    }
    this.loading.set(true);
    this.error.set('');

    this.auth.login(this.inv.email, this.loginPassword).subscribe({
      next: (res) => {
        // After login, accept the invite
        this.api.acceptInvite(this.token).subscribe({
          next: () => {
            this.auth.completeRegistration(res);
            this.loading.set(false);
          },
          error: (err) => {
            this.loading.set(false);
            this.error.set(formatHttpError(err, 'Could not join organisation'));
          },
        });
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Login failed — check your password'));
      },
    });
  }
}