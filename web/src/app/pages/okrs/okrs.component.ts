import { Component, OnInit, computed, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { OKR } from '../../core/models';
import { scoreTone } from '../../core/strategy-score';
import { formatHttpError } from '../../core/http-error';

@Component({
  selector: 'app-okrs',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './okrs.component.html',
  styleUrl: './okr.scss',
})
export class OKRsComponent implements OnInit {
  readonly tone = scoreTone;

  okrs = signal<OKR[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  error = signal('');
  /** 'current' = OKRs still in play; otherwise a "year-quarter" key or 'all'. */
  period = signal('current');

  /** Quarters that have OKRs, newest first, for the period picker. */
  readonly periods = computed(() => {
    const keys = new Map<string, { key: string; label: string; count: number }>();
    for (const o of this.okrs()) {
      const key = `${o.year}-${o.quarter}`;
      const entry = keys.get(key) ?? { key, label: `Q${o.quarter} ${o.year}`, count: 0 };
      entry.count += 1;
      keys.set(key, entry);
    }
    return [...keys.values()];
  });

  readonly currentCount = computed(() => this.okrs().filter((o) => o.status === 'active' || o.status === 'draft').length);

  readonly visibleOkrs = computed(() => {
    const period = this.period();
    if (period === 'all') return this.okrs();
    // With nothing in play, "current" would be an empty page: show everything instead.
    if (period === 'current') return this.currentCount() ? this.okrs().filter((o) => o.status === 'active' || o.status === 'draft') : this.okrs();
    return this.okrs().filter((o) => `${o.year}-${o.quarter}` === period);
  });

  private blankDraft = () => ({
    title: '',
    quarter: (Math.floor(new Date().getMonth() / 3) + 1) as 1 | 2 | 3 | 4,
    year: new Date().getFullYear(),
  });
  draft = this.blankDraft();
  canManageOrg = false;

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
    private readonly router: Router,
  ) {
    // Matches the API: owners, admins and M&E officers can create OKRs.
    this.canManageOrg = ['owner', 'admin', 'me_officer'].includes(auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.loadOKRs();
  }

  createOKR() {
    const title = this.draft.title.trim();
    if (!title) return;
    this.saving.set(true);
    this.error.set('');
    this.api.createOKR({ title, quarter: this.draft.quarter, year: this.draft.year, status: 'draft', keyResults: [] }).subscribe({
      // Straight into the new OKR: the next thing to do is add key results.
      next: (created) => {
        this.saving.set(false);
        this.router.navigate(['/okrs', created._id]);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not create the OKR'));
        this.saving.set(false);
      },
    });
  }

  loadOKRs() {
    this.api.okrs().subscribe({
      next: (okrs) => {
        this.okrs.set(okrs.sort((a, b) => (b.year * 10 + b.quarter) - (a.year * 10 + a.quarter)));
        this.loading.set(false);
      },
      error: (err) => {
        this.okrs.set([]);
        this.error.set(formatHttpError(err, 'Could not load OKRs'));
        this.loading.set(false);
      },
    });
  }

  krStatusLabel(status: string): string {
    return (
      { not_started: 'Not started', in_progress: 'In progress', at_risk: 'At risk', completed: 'Completed' }[status] ?? status
    );
  }
}
