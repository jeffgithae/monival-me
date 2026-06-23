import { Component, signal, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment.prod';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { LogoComponent } from '../../shared/logo.component';
import { GoogleAuthComponent } from '../../shared/google-auth.component';

type Step = 'credentials' | 'mfa';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent, GoogleAuthComponent],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly http = inject(HttpClient);

  readonly showDemoHint = !environment.production;
  readonly demoEmail    = 'demo@evidara.test';
  readonly demoPassword = 'Demo1234!';

  step     = signal<Step>('credentials');
  email    = this.demoEmail;
  password = this.demoPassword;
  totpCode = '';
  error    = signal('');
  loading  = signal(false);

  private challengeToken = '';

  submit() {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: (res: any) => {
        this.loading.set(false);
        if (res?.mfaRequired && res?.challengeToken) {
          this.challengeToken = res.challengeToken;
          this.step.set('mfa');
        }
        // If no mfaRequired, AuthService.login() tap already called setSession
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Login failed'));
      },
    });
  }

  verifyMfa() {
    if (!this.totpCode.trim()) return;
    this.loading.set(true);
    this.error.set('');
    this.http.post<any>(`${environment.apiUrl}/auth/mfa/verify`, {
      challengeToken: this.challengeToken,
      totpCode: this.totpCode.trim(),
    }).subscribe({
      next: (res) => {
        this.loading.set(false);
        this.auth.completeRegistration(res);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.totpCode = '';
        this.error.set(formatHttpError(err, 'Invalid code — try again'));
      },
    });
  }

  backToCredentials() {
    this.step.set('credentials');
    this.challengeToken = '';
    this.totpCode = '';
    this.error.set('');
  }

  onGoogleSuccess(credential: string) {
    this.loading.set(true);
    this.error.set('');
    this.auth.googleLogin(credential).subscribe({
      next: (res: any) => {
        this.loading.set(false);
      },
      error: (err: any) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Google login failed'));
      },
    });
  }
}