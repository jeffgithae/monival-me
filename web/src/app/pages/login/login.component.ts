import { Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { environment } from '../../../environments/environment.prod';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
})
export class LoginComponent {
  readonly showDemoHint = !environment.production;
  readonly demoEmail = 'demo@evidara.test';
  readonly demoPassword = 'Demo1234!';

  email = this.demoEmail;
  password = this.demoPassword;
  error = signal('');
  loading = signal(false);

  constructor(private readonly auth: AuthService) {}

  submit() {
    this.loading.set(true);
    this.error.set('');
    this.auth.login(this.email, this.password).subscribe({
      next: () => this.loading.set(false),
      error: (err) => {
        this.loading.set(false);
        this.error.set(formatHttpError(err, 'Login failed'));
      },
    });
  }
}
