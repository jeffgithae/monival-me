import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  ReportingPeriod, ReportingPeriodStatus, CreateReportingPeriodDto,
  IndicatorResult, DataQualityReport, Project, Indicator,
} from '../../core/models';

type DetailTab = 'results' | 'narrative' | 'dq' | 'history';

@Component({
  selector: 'app-reporting-periods',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, DatePipe],
  templateUrl: './reporting-period.component.html',
  styleUrl: './reporting-period.component.scss',
})
export class ReportingPeriodsComponent implements OnInit {
  private api   = inject(ApiService);
  private auth  = inject(AuthService);
  private route = inject(ActivatedRoute);
  private fb    = inject(FormBuilder);

  periods       = signal<ReportingPeriod[]>([]);
  projects      = signal<Project[]>([]);
  selected      = signal<ReportingPeriod | null>(null);
  results       = signal<IndicatorResult[]>([]);
  resultsLoading = signal(false);
  dqReport      = signal<DataQualityReport | null>(null);
  dqLoading     = signal(false);
  loading       = signal(true);
  saving        = signal(false);
  calculating   = signal(false);
  showForm      = signal(false);
  editingPeriod = signal(false);
  showStatusConfirm = signal<ReportingPeriodStatus | null>(null);
  activeTab     = signal<DetailTab>('results');
  error         = signal('');
  filterProjectId = signal('');
  filterStatus    = signal<ReportingPeriodStatus | ''>('');
  searchQuery     = signal('');

  canManage  = computed(() => this.auth.isOwner() || this.auth.isAdmin() || this.auth.isMEOfficer());
  canApprove = computed(() => this.auth.isOwner() || this.auth.isAdmin());

  readonly cadences: Array<{ id: string; label: string }> = [
    { id: 'monthly',     label: 'Monthly' },
    { id: 'quarterly',   label: 'Quarterly' },
    { id: 'semiannual',  label: 'Semi-annual' },
    { id: 'annual',      label: 'Annual' },
    { id: 'custom',      label: 'Custom' },
  ];

  readonly statuses: ReportingPeriodStatus[] = ['open', 'submitted', 'approved', 'locked'];

  form = this.fb.group({
    name:       ['', Validators.required],
    cadence:    ['quarterly', Validators.required],
    startDate:  ['', Validators.required],
    endDate:    ['', Validators.required],
    dueDate:    [''],
    projectId:  ['', Validators.required],
    notes:      [''],
  });

  narrativeForm = this.fb.group({
    narrative:        [''],
    challenges:       [''],
    lessonsLearned:   [''],
    nextPeriodPlans:  [''],
  });

  statusNoteForm = this.fb.group({
    notes: [''],
  });

  // ── Derived list (filtered + searched) ──────────────────────────────────────
  readonly filteredPeriods = computed(() => {
    let list = this.periods();
    const status = this.filterStatus();
    if (status) list = list.filter(p => p.status === status);
    const q = this.searchQuery().trim().toLowerCase();
    if (q) list = list.filter(p => p.name.toLowerCase().includes(q) || (p.projectName ?? '').toLowerCase().includes(q));
    return list;
  });

  readonly totalPeriods     = computed(() => this.periods().length);
  readonly approvedPeriods  = computed(() => this.periods().filter(p => p.status === 'approved').length);
  readonly submittedPeriods = computed(() => this.periods().filter(p => p.status === 'submitted').length);
  readonly openPeriods      = computed(() => this.periods().filter(p => p.status === 'open').length);
  readonly overdueCount     = computed(() => this.periods().filter(p => this.isOverdue(p)).length);

  // ── Selected-period derived state ───────────────────────────────────────────
  readonly canCalculate = computed(() => {
    const p = this.selected();
    return !!p && p.status === 'open' && this.canManage();
  });
  readonly canEditNarrative = computed(() => {
    const p = this.selected();
    return !!p && p.status !== 'locked' && this.canManage();
  });
  readonly canSubmit = computed(() => {
    const p = this.selected();
    return !!p && p.status === 'open' && this.canManage();
  });
  readonly canApproveSelected = computed(() => {
    const p = this.selected();
    return !!p && p.status === 'submitted' && this.canApprove();
  });
  readonly canLock = computed(() => {
    const p = this.selected();
    return !!p && p.status === 'approved' && this.canApprove();
  });
  readonly canReopen = computed(() => {
    const p = this.selected();
    // Locking is meant to be final, so reopening only goes back one step
    // (approved/submitted -> open is not offered for locked periods).
    return !!p && (p.status === 'submitted' || p.status === 'approved') && this.canApprove();
  });
  readonly isLocked = computed(() => this.selected()?.status === 'locked');

  readonly resultsProgress = computed(() => {
    const r = this.results();
    if (r.length === 0) return null;
    const withTarget = r.filter(x => x.targetValue !== null && x.targetValue !== undefined);
    if (withTarget.length === 0) return null;
    const avg = withTarget.reduce((sum, x) => sum + (x.percentAchieved ?? 0), 0) / withTarget.length;
    return Math.round(avg * 10) / 10;
  });

  ngOnInit() {
    const projectId = this.route.snapshot.queryParamMap.get('projectId');
    if (projectId) this.filterProjectId.set(projectId);
    this.api.projects().subscribe({ next: ps => this.projects.set(ps), error: () => {} });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    const params: any = {};
    if (this.filterProjectId()) params.projectId = this.filterProjectId();
    this.api.reportingPeriods(params).subscribe({
      next: res => {
        const list = res.data ?? [];
        this.periods.set(list);
        this.loading.set(false);
        // Keep the open detail panel in sync if its period is still in the list
        const sel = this.selected();
        if (sel) {
          const fresh = list.find((p: ReportingPeriod) => p._id === sel._id);
          if (fresh) this.selected.set(fresh);
        }
      },
      error: err => { this.error.set(err.error?.message || 'Failed to load reporting periods'); this.loading.set(false); }
    });
  }

  setProjectFilter(id: string) {
    this.filterProjectId.set(id);
    this.load();
  }

  setStatusFilter(s: ReportingPeriodStatus | '') {
    this.filterStatus.set(s);
  }

  // ── Create / edit ────────────────────────────────────────────────────────────

  toggleForm() {
    this.showForm.update(v => !v);
    this.editingPeriod.set(false);
    if (this.showForm()) {
      this.form.reset({ cadence: 'quarterly', projectId: this.filterProjectId() || '' });
    }
  }

  startEdit(p: ReportingPeriod) {
    this.editingPeriod.set(true);
    this.showForm.set(true);
    this.form.patchValue({
      name: p.name,
      cadence: p.cadence,
      startDate: p.startDate?.slice(0, 10),
      endDate: p.endDate?.slice(0, 10),
      dueDate: p.dueDate?.slice(0, 10) ?? '',
      projectId: p.projectId,
      notes: p.notes ?? '',
    });
  }

  submitForm() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.error.set('');

    if (this.editingPeriod()) {
      const p = this.selected();
      if (!p) { this.saving.set(false); return; }
      const { projectId, ...editable } = this.form.value;
      this.api.updateReportingPeriod(p._id, editable as any).subscribe({
        next: updated => {
          this.applyUpdatedPeriod(updated);
          this.saving.set(false);
          this.showForm.set(false);
          this.editingPeriod.set(false);
        },
        error: err => { this.error.set(err.error?.message || 'Update failed'); this.saving.set(false); },
      });
      return;
    }

    this.api.createReportingPeriod(this.form.value as CreateReportingPeriodDto).subscribe({
      next: p => {
        this.periods.update(arr => [p, ...arr]);
        this.form.reset({ cadence: 'quarterly' });
        this.showForm.set(false);
        this.saving.set(false);
        this.selectPeriod(p);
      },
      error: err => { this.error.set(err.error?.message || 'Could not create reporting period'); this.saving.set(false); }
    });
  }

  // ── Selection & detail data ──────────────────────────────────────────────────

  selectPeriod(p: ReportingPeriod) {
    this.selected.set(p);
    this.activeTab.set('results');
    this.showForm.set(false);
    this.narrativeForm.patchValue({
      narrative:       p.narrative ?? '',
      challenges:      p.challenges ?? '',
      lessonsLearned:  p.lessonsLearned ?? '',
      nextPeriodPlans: p.nextPeriodPlans ?? '',
    });
    this.loadResults(p._id);
  }

  closeDetail() {
    this.selected.set(null);
  }

  switchTab(tab: DetailTab) {
    this.activeTab.set(tab);
    const p = this.selected();
    if (!p) return;
    if (tab === 'dq' && !this.dqReport()) this.loadDQ(p);
  }

  loadResults(periodId: string) {
    this.resultsLoading.set(true);
    this.api.indicatorResults(periodId).subscribe({
      next: r => { this.results.set(r); this.resultsLoading.set(false); },
      error: () => { this.results.set([]); this.resultsLoading.set(false); },
    });
  }

  loadDQ(p: ReportingPeriod) {
    this.dqLoading.set(true);
    this.api.dataQualityReport(p.projectId, p._id).subscribe({
      next: (r: DataQualityReport) => { this.dqReport.set(r); this.dqLoading.set(false); },
      error: () => { this.dqReport.set(null); this.dqLoading.set(false); },
    });
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  calculate() {
    const p = this.selected();
    if (!p) return;
    this.calculating.set(true);
    this.api.calculatePeriodResults(p._id).subscribe({
      next: () => {
        this.calculating.set(false);
        this.loadResults(p._id);
        this.api.reportingPeriod(p._id).subscribe(updated => this.applyUpdatedPeriod(updated));
      },
      error: err => { this.error.set(err.error?.message || 'Calculation failed'); this.calculating.set(false); }
    });
  }

  updateResult(result: IndicatorResult, field: 'achieved' | 'narrative', rawValue: string) {
    const p = this.selected();
    if (!p) return;
    const indicatorId = typeof result.indicatorId === 'string' ? result.indicatorId : result.indicatorId._id;
    const value = field === 'achieved' ? Number(rawValue) : rawValue;
    if (field === 'achieved' && Number.isNaN(value as number)) return;

    this.api.upsertIndicatorResult({
      reportingPeriodId: p._id,
      indicatorId,
      achieved: field === 'achieved' ? (value as number) : result.achieved,
      narrative: field === 'narrative' ? (value as string) : result.narrative,
    }).subscribe({
      next: updated => {
        this.results.update(list => list.map(r => r._id === updated._id ? { ...r, ...updated } : r));
      },
      error: err => this.error.set(err.error?.message || 'Could not save that result'),
    });
  }

  saveNarrative() {
    const p = this.selected();
    if (!p) return;
    this.saving.set(true);
    this.api.updatePeriodNarrative(p._id, this.narrativeForm.value as any).subscribe({
      next: updated => {
        this.applyUpdatedPeriod(updated);
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Could not save narrative'); this.saving.set(false); }
    });
  }

  confirmStatusChange(newStatus: ReportingPeriodStatus) {
    this.statusNoteForm.reset();
    this.showStatusConfirm.set(newStatus);
  }

  cancelStatusChange() {
    this.showStatusConfirm.set(null);
  }

  applyStatusChange() {
    const p = this.selected();
    const newStatus = this.showStatusConfirm();
    if (!p || !newStatus) return;
    this.saving.set(true);
    this.api.updatePeriodStatus(p._id, newStatus, this.statusNoteForm.value.notes || undefined).subscribe({
      next: updated => {
        this.applyUpdatedPeriod(updated);
        this.saving.set(false);
        this.showStatusConfirm.set(null);
      },
      error: err => { this.error.set(err.error?.message || 'Could not update status'); this.saving.set(false); }
    });
  }

  export(format: 'pdf' | 'excel') {
    const p = this.selected();
    if (!p) return;
    this.api.exportPeriodReport(p._id, format).subscribe({
      next: (blob: any) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${p.name.replace(/[^a-z0-9]+/gi, '-')}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('Export failed. Please try again in a moment.')
    });
  }

  private applyUpdatedPeriod(updated: ReportingPeriod) {
    this.selected.set(updated);
    this.periods.update(arr => arr.map(x => x._id === updated._id ? updated : x));
  }

  // ── Display helpers ──────────────────────────────────────────────────────────

  statusBadge(status: ReportingPeriodStatus): string {
    const map: Record<ReportingPeriodStatus, string> = {
      open: 'status-open', submitted: 'status-submitted', approved: 'status-approved', locked: 'status-locked',
    };
    return map[status];
  }

  statusLabel(status: ReportingPeriodStatus): string {
    const map: Record<ReportingPeriodStatus, string> = {
      open: 'Open', submitted: 'Submitted', approved: 'Approved', locked: 'Locked',
    };
    return map[status];
  }

  cadenceLabel(cadence: string): string {
    return this.cadences.find(c => c.id === cadence)?.label ?? cadence;
  }

  isOverdue(p: ReportingPeriod): boolean {
    if (!p.dueDate || p.status === 'approved' || p.status === 'locked') return false;
    return new Date(p.dueDate) < new Date();
  }

  daysUntilDue(p: ReportingPeriod): number | null {
    if (!p.dueDate) return null;
    const diff = new Date(p.dueDate).getTime() - new Date().getTime();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  }

  indicatorOf(r: IndicatorResult): Indicator | null {
    return typeof r.indicatorId === 'object' ? r.indicatorId : null;
  }

  severityIcon(severity: string): string {
    return { critical: '🔴', warning: '🟡', info: '🔵' }[severity] ?? '⚪';
  }

  progressBarClass(pct: number | null | undefined): string {
    if (pct === null || pct === undefined) return 'bar-unknown';
    if (pct >= 90) return 'bar-good';
    if (pct >= 60) return 'bar-warn';
    return 'bar-risk';
  }
}