import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { LogoComponent } from '../../shared/logo.component';
import { GoogleAuthComponent } from '../../shared/google-auth.component';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent, GoogleAuthComponent],
  templateUrl: './register.component.html',
  styleUrl: '../login/login.component.scss',
})
export class RegisterComponent implements OnInit {
  step: 'account' | 'workspace' = 'account';

  // Step 1: Account
  email = '';
  password = '';
  name = '';

  // Step 2: Workspace
  organizationName = '';
  country = '';
  sector = '';
  planId = 'trial';

  error = signal('');
  loading = signal(false);

  constructor(
    private readonly auth: AuthService,
    private readonly api: ApiService,
    private readonly route: ActivatedRoute,
  ) { }

  ngOnInit() {
    const plan = this.route.snapshot.queryParamMap.get('plan');
    const setup = this.route.snapshot.queryParamMap.get('setup');

    if (
      plan === 'starter' ||
      plan === 'professional' ||
      plan === 'organization' ||
      plan === 'trial'
    ) {
      this.planId = plan;
    }

    if (setup === 'true' || (this.auth.isLoggedIn && !this.auth.user()?.organizationId)) {
      this.step = 'workspace';
    }
  }

  submitAccount() {
    this.loading.set(true);
    this.error.set('');
    this.auth
      .register({
        email: this.email,
        password: this.password,
        name: this.name,
      })
      .subscribe({
        next: (res) => {
          this.auth.completeRegistration(res, false); // Save token but don't redirect yet
          this.loading.set(false);
          this.step = 'workspace';
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(formatHttpError(err, 'Account creation failed'));
        },
      });
  }

  submitWorkspace() {
    this.loading.set(true);
    this.error.set('');
    this.auth
      .bootstrapWorkspace({
        name: this.organizationName,
        country: this.country || undefined,
        sector: this.sector || undefined,
        planId: this.planId,
      })
      .subscribe({
        next: (res) => {
          if (res.checkoutRequired && this.planId !== 'trial') {
            this.auth.completeRegistration(res, false);
            if (res.checkout?.url) {
              window.location.href = res.checkout.url;
            } else {
              this.api.checkout(this.planId).subscribe({
                next: (checkout) => {
                  this.loading.set(false);
                  if (checkout.url) {
                    window.location.href = checkout.url;
                  }
                },
                error: (err) => {
                  this.loading.set(false);
                  this.error.set(formatHttpError(err, 'Workspace created but checkout failed'));
                },
              });
            }
          } else {
            this.auth.completeRegistration(res);
            this.loading.set(false);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(formatHttpError(err, 'Workspace creation failed'));
        },
      });
  }

  onGoogleSuccess(credential: string) {
    this.loading.set(true);
    this.error.set('');
    this.auth.googleLogin(credential).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        this.auth.completeRegistration(res, false); // Save tokens
        
        // If user already has an org, redirect them. If not, go to workspace step.
        if (res.user?.organizationId) {
          this.auth.completeRegistration(res, true); // this will redirect
        } else {
          this.step = 'workspace';
        }
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Google registration failed'));
      },
    });
  }
}
