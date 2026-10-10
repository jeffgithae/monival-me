import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, computed, signal } from '@angular/core';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { Observable } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { BalancedScorecard, Indicator, OKR, OKRKeyResult, Project } from '../../core/models';
import { keyResultProgress, scoreTone } from '../../core/strategy-score';
import { ConfirmService } from '../../shared/confirm.service';
import { ToastService } from '../../core/toast.service';

@Component({
  selector: 'app-okr-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule],
  templateUrl: './okr-detail.component.html',
  styleUrl: './okr.scss',
})
export class OKRDetailComponent implements OnInit {
  readonly tone = scoreTone;
  readonly progressOf = keyResultProgress;

  okr = signal<OKR | null>(null);
  indicators = signal<Indicator[]>([]);
  projects = signal<Project[]>([]);
  scorecards = signal<BalancedScorecard[]>([]);
  loading = signal(true);
  busy = signal(false);
  error = signal('');
  showKrForm = signal(false);
  editingOkr = signal(false);

  /** Structure (key results, status, links) — owner, admin, M&E officer. */
  readonly canManage: boolean;
  /** Values, confidence and key-result status — the above plus finance. */
  readonly canUpdate: boolean;
  readonly canDelete: boolean;

  private okrId = '';
  private blankKr = () => ({ title: '', unit: '', targetValue: null as number | null, confidence: 70, indicatorId: '' });
  krForm = this.blankKr();
  okrForm = { title: '', description: '' };

  readonly indicatorById = computed(() => new Map(this.indicators().map((i) => [i._id, i])));

  readonly summary = computed(() => {
    const krs = this.okr()?.keyResults ?? [];
    return {
      total: krs.length,
      completed: krs.filter((kr) => kr.status === 'completed').length,
      atRisk: krs.filter((kr) => kr.status === 'at_risk').length,
      confidence: krs.length ? Math.round(krs.reduce((sum, kr) => sum + (kr.confidence ?? 0), 0) / krs.length) : null,
    };
  });

  /** Scorecard objectives this OKR delivers — the link is stored on the objective. */
  readonly contributesTo = computed(() => {
    const id = this.okr()?._id;
    if (!id) return [];
    return this.scorecards().flatMap((bsc) =>
      bsc.perspectives.flatMap((p) =>
        p.objectives
          .filter((o) => o.linkedOkrIds?.includes(id))
          .map((o) => ({ bscId: bsc._id, scorecard: bsc.name, objective: o.title })),
      ),
    );
  });

  readonly linkableProjects = computed(() => {
    const linked = new Set((this.okr()?.linkedProjects ?? []).map((p) => p._id));
    return this.projects().filter((p) => !linked.has(p._id));
  });

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
    this.okrId = this.route.snapshot.paramMap.get('id') || '';
    this.load();
    // Reference data for labels and pickers; the page still works if any of it fails.
    this.api.indicators().subscribe({ next: (list) => this.indicators.set(list), error: () => this.indicators.set([]) });
    this.api.projects().subscribe({ next: (list) => this.projects.set(list), error: () => this.projects.set([]) });
    this.api.balancedScorecards().subscribe({ next: (list) => this.scorecards.set(list), error: () => this.scorecards.set([]) });
  }

  load() {
    this.loading.set(true);
    this.api.okr(this.okrId).subscribe({
      next: (okr) => {
        this.okr.set(okr);
        this.loading.set(false);
      },
      error: (err) => {
        if (err?.status !== 404) this.error.set(formatHttpError(err, 'Could not load the OKR'));
        this.loading.set(false);
      },
    });
  }

  statusLabel(status: string): string {
    return (
      { not_started: 'Not started', in_progress: 'In progress', at_risk: 'At risk', completed: 'Completed' }[status] ?? status
    );
  }

  indicatorLabel(i: Indicator): string {
    return i.code && i.code !== i.title ? `${i.code} — ${i.title}` : i.title;
  }

  // ── OKR actions ────────────────────────────────────────────────────────────

  setStatus(status: string) {
    this.save(this.api.updateOKR(this.okrId, { status: status as OKR['status'] }), 'Could not update the OKR');
  }

  openEditOkr() {
    const o = this.okr();
    if (!o) return;
    this.okrForm = { title: o.title, description: o.description ?? '' };
    this.editingOkr.set(true);
  }

  saveOkr() {
    const title = this.okrForm.title.trim();
    if (!title) return;
    this.save(
      this.api.updateOKR(this.okrId, { title, description: this.okrForm.description.trim() }),
      'Could not save the OKR',
      () => this.editingOkr.set(false),
    );
  }

  markReviewed() {
    this.save(this.api.markOKRAsReviewed(this.okrId), 'Could not record the review', () =>
      this.toast.success('Review recorded'),
    );
  }

  async deleteOkr() {
    const o = this.okr();
    if (!o) return;
    const ok = await this.confirm.ask({
      title: 'Delete OKR?',
      message: `"${o.title}" and its ${o.keyResults.length} key results will be removed.`,
      consequence: this.contributesTo().length
        ? 'Scorecard objectives it delivers will stop counting its progress. This cannot be undone.'
        : 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    this.busy.set(true);
    this.api.deleteOKR(this.okrId).subscribe({
      next: () => {
        this.toast.success('OKR deleted');
        this.router.navigate(['/okrs']);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not delete the OKR'));
        this.busy.set(false);
      },
    });
  }

  // ── Project links ──────────────────────────────────────────────────────────

  linkProject(select: HTMLSelectElement) {
    const projectId = select.value;
    select.value = '';
    if (!projectId) return;
    const ids = (this.okr()?.linkedProjects ?? []).map((p) => p._id);
    this.save(this.api.updateOKR(this.okrId, { linkedProjects: [...ids, projectId] }), 'Could not link the project');
  }

  unlinkProject(projectId: string) {
    const ids = (this.okr()?.linkedProjects ?? []).map((p) => p._id).filter((id) => id !== projectId);
    this.save(this.api.updateOKR(this.okrId, { linkedProjects: ids }), 'Could not unlink the project');
  }

  // ── Key results ────────────────────────────────────────────────────────────

  openKrForm() {
    this.krForm = this.blankKr();
    this.showKrForm.set(true);
  }

  /** Picking an indicator fills in what it already knows, without overwriting what was typed. */
  onKrIndicatorPicked() {
    const indicator = this.indicatorById().get(this.krForm.indicatorId);
    if (!indicator) return;
    if (!this.krForm.title.trim()) this.krForm.title = indicator.title;
    if (!this.krForm.unit.trim() && indicator.unit) this.krForm.unit = indicator.unit;
    if (!this.krForm.targetValue && indicator.target) this.krForm.targetValue = indicator.target;
  }

  canSaveKr(): boolean {
    const c = Number(this.krForm.confidence);
    return !!this.krForm.title.trim() && Number(this.krForm.targetValue) > 0 && c >= 0 && c <= 100;
  }

  addKeyResult() {
    const o = this.okr();
    if (!o || !this.canSaveKr()) return;

    const keyResults: OKRKeyResult[] = [
      ...this.cleanKeyResults(o),
      {
        title: this.krForm.title.trim(),
        unit: this.krForm.unit.trim(),
        targetValue: Number(this.krForm.targetValue),
        currentValue: 0,
        confidence: Number(this.krForm.confidence),
        status: 'not_started',
        indicatorId: this.krForm.indicatorId || null,
      },
    ];
    this.save(this.api.updateOKR(this.okrId, { keyResults }), 'Could not add the key result', () =>
      this.showKrForm.set(false),
    );
  }

  async removeKeyResult(index: number) {
    const o = this.okr();
    if (!o) return;
    const ok = await this.confirm.ask({
      title: 'Remove key result?',
      message: `"${o.keyResults[index].title}" will be removed from this OKR.`,
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    const keyResults = this.cleanKeyResults(o);
    keyResults.splice(index, 1);
    this.save(this.api.updateOKR(this.okrId, { keyResults }), 'Could not remove the key result');
  }

  setKrStatus(index: number, status: string) {
    this.patchKr(index, { status: status as OKRKeyResult['status'] });
  }

  setKrValue(index: number, raw: number | string | null) {
    const currentValue = Number(raw);
    if (raw === null || raw === '' || !Number.isFinite(currentValue) || currentValue < 0) {
      this.error.set('Current value must be zero or more.');
      this.load();
      return;
    }
    this.patchKr(index, { currentValue });
  }

  setKrConfidence(index: number, raw: number | string | null) {
    const confidence = Number(raw);
    if (raw === null || raw === '' || !Number.isFinite(confidence) || confidence < 0 || confidence > 100) {
      this.error.set('Confidence must be between 0 and 100.');
      this.load();
      return;
    }
    this.patchKr(index, { confidence });
  }

  linkIndicator(index: number, select: HTMLSelectElement) {
    const indicatorId = select.value;
    select.value = '';
    if (indicatorId) this.patchKr(index, { indicatorId });
  }

  unlinkIndicator(index: number) {
    this.patchKr(index, { indicatorId: null });
  }

  // ── Internals ──────────────────────────────────────────────────────────────

  private patchKr(index: number, body: Partial<OKRKeyResult>) {
    this.save(this.api.updateOKRKeyResult(this.okrId, index, body), 'Could not update the key result');
  }

  /** Every write returns the saved OKR; a failure reloads so the page never shows unsaved values. */
  private save(request: Observable<OKR>, failure: string, done?: () => void) {
    this.busy.set(true);
    this.error.set('');
    request.subscribe({
      next: (okr) => {
        this.okr.set(okr);
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

  /** Only the fields the API accepts for a key result. */
  private cleanKeyResults(o: OKR): OKRKeyResult[] {
    return o.keyResults.map((kr) => ({
      ...(kr._id ? { _id: kr._id } : {}),
      title: kr.title,
      ...(kr.description ? { description: kr.description } : {}),
      targetValue: kr.targetValue,
      currentValue: kr.currentValue ?? 0,
      unit: kr.unit ?? '',
      confidence: kr.confidence ?? 50,
      status: kr.status,
      ...(kr.notes ? { notes: kr.notes } : {}),
      indicatorId: kr.indicatorId ?? null,
    }));
  }
}
