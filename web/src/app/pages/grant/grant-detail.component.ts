import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Grant } from '../../core/models';

@Component({
  selector: 'app-grant-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, DatePipe],
  template: `
    <div class="grant-detail">
      <a routerLink="/grants" class="back-link">← All grants</a>

      @if (loading()) {
        <p class="muted">Loading grant…</p>
      } @else if (error()) {
        <p class="error">{{ error() }}</p>
      }
      @if (grant(); as g) {
        <header class="head">
          <div>
            <span class="status" [class]="'status ' + (g.status || '')">{{ g.status || '—' }}</span>
            <h1>{{ g.title || g.name }}</h1>
            <p class="muted">
              @if (g.referenceNumber) { Ref {{ g.referenceNumber }} · }
              @if (donorName()) { Funded by {{ donorName() }} · }
              {{ g.startDate | date:'d MMM y' }} – {{ g.endDate | date:'d MMM y' }}
            </p>
          </div>
        </header>

        <section class="stats">
          <div class="stat">
            <span class="label">Total awarded</span>
            <strong>{{ g.currency }} {{ totalAmount() | number }}</strong>
          </div>
          <div class="stat">
            <span class="label">Spent</span>
            <strong>{{ g.currency }} {{ spentAmount() | number }}</strong>
          </div>
          <div class="stat">
            <span class="label">Remaining</span>
            <strong>{{ g.currency }} {{ totalAmount() - spentAmount() | number }}</strong>
          </div>
          <div class="stat">
            <span class="label">Utilisation</span>
            <strong>{{ utilisation() }}%</strong>
            <div class="bar"><span [style.width.%]="utilisation()"></span></div>
          </div>
        </section>

        @if (g.description) {
          <section class="block">
            <h2>Description</h2>
            <p>{{ g.description }}</p>
          </section>
        }
        @if (g.objectives) {
          <section class="block">
            <h2>Objectives</h2>
            <p>{{ g.objectives }}</p>
          </section>
        }

        <section class="block">
          <h2>Reporting & conditions</h2>
          <ul class="facts">
            @if (g.reportingFrequency) { <li>Reporting frequency: {{ g.reportingFrequency }}</li> }
            @if (g.nextReportDue) { <li>Next report due: {{ g.nextReportDue | date:'d MMM y' }}</li> }
            <li>Restricted funding: {{ g.isRestricted ? 'Yes' : 'No' }}</li>
            @for (c of g.conditionsPrecedent ?? []; track c) { <li>Condition: {{ c }}</li> }
          </ul>
        </section>
      }
    </div>
  `,
  styles: [`
    .grant-detail { padding: 1.5rem 2rem; max-width: 60rem; }
    .back-link { font-size: .85rem; color: #4338ca; text-decoration: none; }
    .head { margin: .75rem 0 1.25rem; }
    .head h1 { margin: .25rem 0; font-size: 1.6rem; }
    .muted { color: #6b7280; font-size: .9rem; }
    .error { color: #b91c1c; }
    .status { display: inline-block; padding: .15rem .6rem; border-radius: 999px; font-size: .75rem;
      text-transform: capitalize; background: #eef2ff; color: #4338ca; }
    .status.active { background: #ecfdf5; color: #047857; }
    .status.completed, .status.closed { background: #f3f4f6; color: #374151; }
    .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr)); gap: 1rem; margin-bottom: 1.5rem; }
    .stat { background: #fff; border: 1px solid #e5e7eb; border-radius: .75rem; padding: 1rem; }
    .stat .label { display: block; font-size: .75rem; color: #6b7280; text-transform: uppercase; letter-spacing: .04em; }
    .stat strong { font-size: 1.25rem; }
    .bar { height: .4rem; background: #e5e7eb; border-radius: 999px; margin-top: .5rem; overflow: hidden; }
    .bar span { display: block; height: 100%; background: #6366f1; border-radius: 999px; }
    .block { margin-bottom: 1.5rem; }
    .block h2 { font-size: 1rem; margin-bottom: .4rem; }
    .facts { list-style: none; padding: 0; margin: 0; }
    .facts li { padding: .3rem 0; border-bottom: 1px solid #f3f4f6; font-size: .9rem; }
  `],
})
export class GrantDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  grant = signal<Grant | null>(null);
  loading = signal(true);
  error = signal('');

  totalAmount = computed(() => this.grant()?.totalAmount ?? this.grant()?.amount ?? 0);
  spentAmount = computed(() => this.grant()?.spentAmount ?? this.grant()?.amountSpent ?? 0);
  utilisation = computed(() => {
    const total = this.totalAmount();
    return total > 0 ? Math.round((this.spentAmount() / total) * 100) : 0;
  });
  donorName = computed(() => {
    const g = this.grant();
    return g?.donorName || (typeof g?.donorId === 'object' ? g?.donorId?.name : '');
  });

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.api.grant(id).subscribe({
      next: g => { this.grant.set(g); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Failed to load grant'); this.loading.set(false); },
    });
  }
}
