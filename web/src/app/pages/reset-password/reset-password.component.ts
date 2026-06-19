import { Component, signal, OnInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink, ActivatedRoute } from '@angular/router';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { LogoComponent } from '../../shared/logo.component';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [FormsModule, RouterLink, LogoComponent],
  templateUrl: './reset-password.component.html',
  styleUrl: '../login/login.component.scss',
})
export class ResetPasswordComponent implements OnInit {
  token = '';
  password = '';
  confirmPassword = '';
  error = signal('');
  loading = signal(false);
  success = signal(false);

  constructor(private readonly auth: AuthService, private readonly route: ActivatedRoute) {}

  ngOnInit() {
    this.route.queryParams.subscribe(params => {
      this.token = params['token'] || '';
      if (!this.token) {
        this.error.set('Invalid or missing reset token.');
      }
    });
  }

  submit() {
    if (this.password !== this.confirmPassword) {
      this.error.set('Passwords do not match');
      return;
    }
    if (this.password.length < 8) {
      this.error.set('Password must be at least 8 characters long');
      return;
    }
    
    this.loading.set(true);
    this.error.set('');
    this.auth.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.loading.set(false);
        this.success.set(true);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Failed to reset password'));
      },
    });
  }
}
