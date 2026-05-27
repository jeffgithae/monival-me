import { Component, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [FormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
})
export class RegisterComponent implements OnInit {
  email = '';
  password = '';
  name = '';
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
  ) {}

  ngOnInit() {
    const plan = this.route.snapshot.queryParamMap.get('plan');
    if (plan === 'starter' || plan === 'professional' || plan === 'trial') {
      this.planId = plan;
    }
  }

  submit() {
    this.loading.set(true);
    this.error.set('');
    this.auth
      .register({
        email: this.email,
        password: this.password,
        name: this.name,
        organizationName: this.organizationName,
        country: this.country || undefined,
        sector: this.sector || undefined,
        planId: this.planId,
      })
      .subscribe({
        next: (res) => {
          this.auth.completeRegistration(res);
          if (res.checkoutRequired && this.planId !== 'trial') {
            this.api.checkout(this.planId).subscribe({
              next: (checkout) => {
                this.loading.set(false);
                if (checkout.url) {
                  window.location.href = checkout.url;
                }
              },
              error: (err) => {
                this.loading.set(false);
                this.error.set(formatHttpError(err, 'Account created but checkout failed'));
              },
            });
          } else {
            this.loading.set(false);
          }
        },
        error: (err) => {
          this.loading.set(false);
          this.error.set(formatHttpError(err, 'Registration failed'));
        },
      });
  }
}
