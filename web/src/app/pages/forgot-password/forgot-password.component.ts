import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent],
  templateUrl: './forgot-password.component.html',
  styleUrl: '../login/login.component.scss',
})
export class ForgotPasswordComponent {
  email = '';
  error = signal('');
  loading = signal(false);
  success = signal(false);

  constructor(private readonly auth: AuthService) {}

  submit() {
    this.loading.set(true);
    this.error.set('');
    this.auth.forgotPassword(this.email).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Failed to send reset link'));
      },
    });
  }
}
