import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { BalancedScorecard } from '../../core/models';
import { PERSPECTIVES, PerspectiveKey, perspectiveScore, scorecardScore, scoreTone } from '../../core/strategy-score';

@Component({
  selector: 'app-bsc-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './bsc-list.component.html',
  styleUrl: './bsc.scss',
})
export class BSCListComponent implements OnInit {
  readonly perspectives = PERSPECTIVES;
  readonly tone = scoreTone;

  scorecards = signal<BalancedScorecard[]>([]);
  loading = signal(true);
  saving = signal(false);
  showForm = signal(false);
  error = signal('');
  readonly canManage: boolean;

  private blankDraft = () => ({ name: '', fiscalYear: new Date().getFullYear(), description: '' });
  draft = this.blankDraft();

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.canManage = ['admin', 'me_officer', 'owner'].includes(this.auth.user()?.role || '');
  }

  ngOnInit() {
    this.loadScorecards();
  }

  toggleForm() {
    this.showForm.update((open) => !open);
    this.error.set('');
  }

  canCreate(): boolean {
    const year = Number(this.draft.fiscalYear);
    return !!this.draft.name.trim() && Number.isInteger(year) && year >= 2000 && year <= 2100;
  }

  loadScorecards() {
    this.loading.set(true);
    this.api.balancedScorecards().subscribe({
      next: (scorecards) => {
        this.scorecards.set(scorecards);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not load scorecards'));
        this.loading.set(false);
      },
    });
  }

  createScorecard() {
    if (!this.canCreate() || this.saving()) return;
    this.saving.set(true);
    this.error.set('');

    const description = this.draft.description.trim();
    this.api.createBalancedScorecard({
      name: this.draft.name.trim(),
      fiscalYear: Number(this.draft.fiscalYear),
      ...(description ? { description } : {}),
      status: 'draft',
      perspectives: PERSPECTIVES.map((p) => ({ perspective: p.key, objectives: [] })),
    }).subscribe({
      // Straight into the new scorecard: the next thing to do is add objectives.
      next: (created) => {
        this.saving.set(false);
        this.router.navigate(['/bsc', created._id]);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not create the scorecard'));
        this.saving.set(false);
      },
    });
  }

  overall(bsc: BalancedScorecard): { value: number } | null {
    const value = scorecardScore(bsc);
    return value === null ? null : { value };
  }

  perspective(bsc: BalancedScorecard, key: PerspectiveKey): number | null {
    const objectives = bsc.perspectives.find((p) => p.perspective === key)?.objectives ?? [];
    return objectives.length ? perspectiveScore(objectives) : null;
  }

  objectiveCount(bsc: BalancedScorecard): number {
    return bsc.perspectives.reduce((count, p) => count + p.objectives.length, 0);
  }
}
