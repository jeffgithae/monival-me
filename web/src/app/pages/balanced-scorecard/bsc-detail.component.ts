import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import {
  BalancedScorecard,
  BalancedScorecardObjective,
  BalancedScorecardPerspective,
  OKR,
} from '../../core/models';
import {
  PERSPECTIVES,
  PerspectiveKey,
  objectiveScore,
  perspectiveScore,
  scorecardScore,
  scoreTone,
} from '../../core/strategy-score';
import { ConfirmService } from '../../shared/confirm.service';
import { ToastService } from '../../core/toast.service';

type ObjectiveStatus = BalancedScorecardObjective['status'];

@Component({
  selector: 'app-bsc-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './bsc-detail.component.html',
  styleUrl: './bsc.scss',
})
export class BSCDetailComponent implements OnInit {
  readonly perspectives = PERSPECTIVES;
  readonly tone = scoreTone;
  readonly score = objectiveScore;

  bsc = signal<BalancedScorecard | null>(null);
  okrs = signal<OKR[]>([]);
  tab = signal<PerspectiveKey>('financial');
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showObjectiveForm = signal(false);
  /** Index of the objective being edited in the current perspective; null while adding. */
  editingIndex = signal<number | null>(null);

  /** Structure (objectives, status, links) — owner, admin, M&E officer. */
  readonly canManage: boolean;
  /** Progress and objective status — the above plus finance. */
  readonly canUpdate: boolean;
  readonly canDelete: boolean;

  private bscId = '';
  private blankObjective = () => ({ title: '', description: '', weight: 25, target: 100 });
  objectiveForm = this.blankObjective();

  readonly overall = computed(() => {
    const b = this.bsc();
    return b ? scorecardScore(b) : null;
  });

  readonly objectiveTotal = computed(() =>
    (this.bsc()?.perspectives ?? []).reduce((count, p) => count + p.objectives.length, 0),
  );

  /** The selected perspective and its position in the document (the API addresses objectives by index). */
  readonly current = computed(() => {
    const index = (this.bsc()?.perspectives ?? []).findIndex((p) => p.perspective === this.tab());
    return { index, objectives: index === -1 ? [] : this.bsc()!.perspectives[index].objectives };
  });

  readonly weightTotal = computed(() =>
    this.current().objectives.reduce((sum, o) => sum + (Number(o.weight) || 0), 0),
  );

  readonly okrById = computed(() => new Map(this.okrs().map((o) => [o._id, o])));

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly confirm: ConfirmService,
    private readonly toast: ToastService,
  ) {
    const role = this.auth.user()?.role || '';
    this.canManage = ['admin', 'me_officer', 'owner'].includes(role);
    this.canUpdate = this.canManage || role === 'finance';
    this.canDelete = ['admin', 'owner'].includes(role);
  }

  ngOnInit() {
    this.bscId = this.route.snapshot.paramMap.get('id') || '';
    this.load();
    // OKRs are only needed to label and offer links; the page works without them.
    this.api.okrs().subscribe({ next: (okrs) => this.okrs.set(okrs), error: () => this.okrs.set([]) });
  }

  load() {
    this.loading.set(true);
    this.api.balancedScorecard(this.bscId).subscribe({
      next: (bsc) => {
        this.bsc.set(bsc);
        this.loading.set(false);
      },
      error: (err) => {
        if (err?.status !== 404) this.error.set(formatHttpError(err, 'Could not load the scorecard'));
        this.loading.set(false);
      },
    });
  }

  setTab(key: PerspectiveKey) {
    this.tab.set(key);
    this.closeObjectiveForm();
  }

  // ── Per-perspective figures ────────────────────────────────────────────────

  objectivesOf(key: PerspectiveKey): BalancedScorecardObjective[] {
    return this.bsc()?.perspectives.find((p) => p.perspective === key)?.objectives ?? [];
  }

  perspectiveValue(key: PerspectiveKey): number | null {
    const objectives = this.objectivesOf(key);
    return objectives.length ? perspectiveScore(objectives) : null;
  }

  statusCount(key: PerspectiveKey, status: ObjectiveStatus): number {
    return this.objectivesOf(key).filter((o) => o.status === status).length;
  }

  statusLabel(status: string): string {
    return { on_track: 'On track', at_risk: 'At risk', off_track: 'Off track' }[status] ?? status;
  }

  // ── Scorecard actions ──────────────────────────────────────────────────────

  setScorecardStatus(status: BalancedScorecard['status']) {
    this.save(this.api.updateBalancedScorecard(this.bscId, { status }), 'Could not update the scorecard', () =>
      this.toast.success(`Scorecard ${status === 'active' ? 'activated' : status === 'archived' ? 'archived' : 'moved to draft'}`),
    );
  }

  markReviewed() {
    this.save(this.api.markBSCAsReviewed(this.bscId), 'Could not record the review', () =>
      this.toast.success('Review recorded'),
    );
  }

  async deleteScorecard() {
    const b = this.bsc();
    if (!b) return;
    const ok = await this.confirm.ask({
      title: 'Delete scorecard?',
      message: `"${b.name}" and its ${this.objectiveTotal()} objectives will be removed.`,
      consequence: 'This cannot be undone. Linked OKRs are not affected.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.deleteBalancedScorecard(this.bscId).subscribe({
      next: () => {
        this.toast.success('Scorecard deleted');
        this.router.navigate(['/bsc']);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not delete the scorecard'));
        this.busy.set(false);
      },
    });
  }

  // ── Objectives ─────────────────────────────────────────────────────────────

  openAddObjective() {
    this.objectiveForm = this.blankObjective();
    this.editingIndex.set(null);
    this.showObjectiveForm.set(true);
  }

  openEditObjective(index: number) {
    const o = this.current().objectives[index];
    this.objectiveForm = { title: o.title, description: o.description ?? '', weight: o.weight, target: o.target };
    this.editingIndex.set(index);
    this.showObjectiveForm.set(true);
  }

  closeObjectiveForm() {
    this.showObjectiveForm.set(false);
    this.editingIndex.set(null);
  }

  canSaveObjective(): boolean {
    const { title, weight, target } = this.objectiveForm;
    return !!title.trim() && Number(weight) >= 0 && Number(weight) <= 100 && Number(target) > 0;
  }

  saveObjective() {
    const b = this.bsc();
    if (!b || !this.canSaveObjective()) return;

    const fields = {
      title: this.objectiveForm.title.trim(),
      description: this.objectiveForm.description.trim(),
      weight: Number(this.objectiveForm.weight),
      target: Number(this.objectiveForm.target),
    };
    const editing = this.editingIndex();

    if (editing !== null) {
      this.save(
        this.api.updateBSCObjective(this.bscId, this.current().index, editing, fields),
        'Could not save the objective',
        () => this.closeObjectiveForm(),
      );
      return;
    }

    const perspectives = this.cleanPerspectives(b);
    let target = perspectives.find((p) => p.perspective === this.tab());
    if (!target) {
      // Scorecards created before all four perspectives were seeded.
      target = { perspective: this.tab(), objectives: [] };
      perspectives.push(target);
    }
    target.objectives.push({ ...fields, current: 0, status: 'on_track', linkedOkrIds: [] });

    this.save(this.api.updateBalancedScorecard(this.bscId, { perspectives }), 'Could not add the objective', () =>
      this.closeObjectiveForm(),
    );
  }

  async removeObjective(index: number) {
    const b = this.bsc();
    if (!b) return;
    const objective = this.current().objectives[index];
    const ok = await this.confirm.ask({
      title: 'Remove objective?',
      message: `"${objective.title}" will be removed from this scorecard.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;

    const perspectives = this.cleanPerspectives(b);
    perspectives[this.current().index].objectives.splice(index, 1);
    this.closeObjectiveForm();
    this.save(this.api.updateBalancedScorecard(this.bscId, { perspectives }), 'Could not remove the objective');
  }

  setObjectiveStatus(index: number, status: string) {
    this.patchObjective(index, { status });
  }

  setObjectiveCurrent(index: number, raw: number | string | null) {
    const current = Number(raw);
    if (raw === null || raw === '' || !Number.isFinite(current) || current < 0) {
      this.error.set('Current progress must be zero or more.');
      this.load();
      return;
    }
    this.patchObjective(index, { current });
  }

  // ── OKR links ──────────────────────────────────────────────────────────────

  /** OKRs not yet linked to this objective, newest quarter first. */
  linkableOkrs(objective: BalancedScorecardObjective): OKR[] {
    const linked = new Set(objective.linkedOkrIds ?? []);
    return this.okrs().filter((o) => !linked.has(o._id) && o.status !== 'archived');
  }

  linkOkr(index: number, select: HTMLSelectElement) {
    const okrId = select.value;
    select.value = '';
    if (!okrId) return;
    const linked = this.current().objectives[index].linkedOkrIds ?? [];
    this.patchObjective(index, { linkedOkrIds: [...linked, okrId] });
  }

  unlinkOkr(index: number, okrId: string) {
    const linked = this.current().objectives[index].linkedOkrIds ?? [];
    this.patchObjective(index, { linkedOkrIds: linked.filter((id) => id !== okrId) });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private patchObjective(index: number, body: Record<string, unknown>) {
    this.save(
      this.api.updateBSCObjective(this.bscId, this.current().index, index, body),
      'Could not update the objective',
    );
  }

  /** Every write returns the saved scorecard; a failure reloads so the page never shows unsaved values. */
  private save(request: Observable<BalancedScorecard>, failure: string, done?: () => void) {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (bsc) => {
        this.bsc.set(bsc);
        this.busy.set(false);
        done?.();
      },
      error: (err) => {
        this.error.set(formatHttpError(err, failure));
        this.busy.set(false);
        this.load();
      },
    });
  }

  /** Only the fields the API accepts: the document also carries server-owned ones it refuses. */
  private cleanPerspectives(b: BalancedScorecard): BalancedScorecardPerspective[] {
    return b.perspectives.map((p) => ({
      ...(p._id ? { _id: p._id } : {}),
      perspective: p.perspective,
      ...(p.strategicTheme ? { strategicTheme: p.strategicTheme } : {}),
      objectives: p.objectives.map((o) => ({
        ...(o._id ? { _id: o._id } : {}),
        title: o.title,
        description: o.description ?? '',
        weight: o.weight,
        target: o.target,
        current: o.current,
        status: o.status,
        linkedOkrIds: o.linkedOkrIds ?? [],
      })),
    }));
  }
}
