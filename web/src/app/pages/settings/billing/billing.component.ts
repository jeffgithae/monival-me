import { DatePipe } from '@angular/common';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../../core/api.service';
import { AuthService } from '../../../core/auth.service';
import { formatHttpError } from '../../../core/http-error';
import { canManageBilling } from '../../../core/roles';

@Component({
  selector: 'app-billing',
  standalone: true,
  imports: [RouterLink, DatePipe],
  templateUrl: './billing.component.html',
  styleUrl: './billing.component.scss',
})
export class BillingComponent implements OnInit {
  status = signal<{
    planId: string;
    planName: string;
    subscriptionStatus: string;
    trialEndsAt?: string;
    currentPeriodEnd?: string;
    mockMode: boolean;
  } | null>(null);
  plans = signal<
    Array<{ id: string; name: string; monthlyPriceUsd: number; description: string }>
  >([]);
  message = signal('');
  loading = signal(false);

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
    private readonly route: ActivatedRoute,
  ) {}

  get canManage() {
    return canManageBilling(this.auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.reload();
    this.api.plans().subscribe((p) => this.plans.set(p.filter((x) => x.id !== 'trial')));
    if (this.route.snapshot.queryParamMap.get('success')) {
      this.message.set('Subscription updated successfully.');
    }
  }

  reload() {
    this.api.billingStatus().subscribe((s) => this.status.set(s));
    this.auth.loadProfile().subscribe();
  }

  subscribe(planId: string) {
    if (!this.canManage) return;
    this.loading.set(true);
    this.api.checkout(planId).subscribe({
      next: (res) => {
        this.loading.set(false);
        if (res.url) {
          window.location.href = res.url;
        }
      },
      error: (err) => {
        this.loading.set(false);
        this.message.set(formatHttpError(err, 'Checkout failed'));
      },
    });
  }

  openPortal() {
    if (!this.canManage) return;
    this.loading.set(true);
    this.api.billingPortal().subscribe({
      next: (res) => {
        this.loading.set(false);
        window.location.href = res.url;
      },
      error: (err) => {
        this.loading.set(false);
        this.message.set(formatHttpError(err, 'Could not open billing portal'));
      },
    });
  }
}
