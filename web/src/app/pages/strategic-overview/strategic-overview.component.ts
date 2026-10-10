import { Component, OnInit, computed, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { BalancedScorecard, OKR, StrategicOverview } from '../../core/models';
import { canManageOrganization } from '../../core/roles';
import { scorecardScore, scoreTone } from '../../core/strategy-score';
import { ToastService } from '../../core/toast.service';

interface PillarDraft {
  pillar: string;
  description: string;
  /** One initiative per line. */
  initiatives: string;
}

@Component({
  selector: 'app-strategic-overview',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './strategic-overview.component.html',
  styleUrl: './strategic-overview.component.scss',
})
export class StrategicOverviewComponent implements OnInit {
  readonly tone = scoreTone;
  readonly maxPillars = 12;

  overview = signal<StrategicOverview | null>(null);
  scorecards = signal<BalancedScorecard[]>([]);
  okrs = signal<OKR[]>([]);
  loading = signal(true);
  editing = signal(false);
  saving = signal(false);
  error = signal('');
  readonly canManageOrg: boolean;

  draft: { vision: string; mission: string; pillars: PillarDraft[] } = { vision: '', mission: '', pillars: [] };

  readonly isEmpty = computed(() => {
    const o = this.overview();
    return !!o && !o.vision && !o.mission && o.strategicPillars.length === 0;
  });

  /** Scorecards in force, each with its overall score. */
  readonly activeScorecards = computed(() =>
    this.scorecards()
      .filter((b) => b.status === 'active')
      .map((b) => ({ id: b._id, name: b.name, fiscalYear: b.fiscalYear, score: scorecardScore(b) })),
  );

  /** Active OKRs for the most recent quarter that has any. */
  readonly currentOkrs = computed(() => {
    const active = this.okrs().filter((o) => o.status === 'active');
    if (!active.length) return null;
    const latest = active.reduce((a, b) => (b.year * 10 + b.quarter > a.year * 10 + a.quarter ? b : a));
    const inQuarter = active.filter((o) => o.year === latest.year && o.quarter === latest.quarter);
    return {
      quarter: latest.quarter,
      year: latest.year,
      okrs: inQuarter,
      progress: Math.round(inQuarter.reduce((sum, o) => sum + (o.progressPercentage ?? 0), 0) / inQuarter.length),
    };
  });

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {
    this.canManageOrg = canManageOrganization(auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.api.getStrategicOverview().subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not load the strategic overview'));
        this.loading.set(false);
      },
    });
    // How the strategy is being delivered; the page stands without these.
    this.api.balancedScorecards().subscribe({ next: (list) => this.scorecards.set(list), error: () => this.scorecards.set([]) });
    this.api.okrs().subscribe({ next: (list) => this.okrs.set(list), error: () => this.okrs.set([]) });
  }

  startEditing() {
    const o = this.overview();
    this.draft = {
      vision: o?.vision ?? '',
      mission: o?.mission ?? '',
      pillars: (o?.strategicPillars ?? []).map((p) => ({
        pillar: p.pillar,
        description: p.description ?? '',
        initiatives: (p.initiatives ?? []).join('\n'),
      })),
    };
    this.error.set('');
    this.editing.set(true);
  }

  addPillar() {
    if (this.draft.pillars.length < this.maxPillars) {
      this.draft.pillars.push({ pillar: '', description: '', initiatives: '' });
    }
  }

  removePillar(index: number) {
    this.draft.pillars.splice(index, 1);
  }

  /** Every pillar that has any content needs a name. */
  canSave(): boolean {
    return this.draft.pillars.every((p) => !!p.pillar.trim() || (!p.description.trim() && !p.initiatives.trim()));
  }

  save() {
    if (!this.canSave() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');
    this.api.updateStrategicOverview({
      vision: this.draft.vision.trim(),
      mission: this.draft.mission.trim(),
      strategicPillars: this.draft.pillars
        .filter((p) => !!p.pillar.trim())
        .map((p) => ({
          pillar: p.pillar.trim(),
          description: p.description.trim(),
          initiatives: p.initiatives.split('\n').map((i) => i.trim()).filter((i) => !!i).slice(0, 12),
        })),
    }).subscribe({
      next: (overview) => {
        this.overview.set(overview);
        this.saving.set(false);
        this.editing.set(false);
        this.toast.success('Strategic overview saved');
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not save the strategic overview'));
        this.saving.set(false);
      },
    });
  }
}
