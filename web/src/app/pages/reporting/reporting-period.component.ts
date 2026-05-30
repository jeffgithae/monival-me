// web/src/app/pages/reporting-periods/reporting-periods.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, ActivatedRoute } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  ReportingPeriod, ReportingPeriodStatus, CreateReportingPeriodDto,
  IndicatorResult, DataQualityReport
} from '../../core/models';

@Component({
  selector: 'app-reporting-periods',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  templateUrl: './reporting-periods.component.html',
  styleUrl: './reporting-periods.component.scss',
})
export class ReportingPeriodsComponent implements OnInit {
  private api   = inject(ApiService);
  private auth  = inject(AuthService);
  private route = inject(ActivatedRoute);
  private fb    = inject(FormBuilder);

  periods      = signal<ReportingPeriod[]>([]);
  selected     = signal<ReportingPeriod | null>(null);
  dqReport     = signal<DataQualityReport | null>(null);
  loading      = signal(true);
  saving       = signal(false);
  calculating  = signal(false);
  showForm     = signal(false);
  activeTab    = signal<'results' | 'narrative' | 'dq'>('results');
  error        = signal('');
  filterProjectId = signal('');

  canManage = computed(() => this.auth.isOwner() || this.auth.isAdmin() || (this.auth as any).isMEOfficer?.());
  canApprove = computed(() => this.auth.isOwner() || this.auth.isAdmin());

  frequencies = ['monthly', 'quarterly', 'semiannual', 'annual', 'custom'];

  form = this.fb.group({
    name:       ['', Validators.required],
    frequency:  ['quarterly', Validators.required],
    startDate:  ['', Validators.required],
    endDate:    ['', Validators.required],
    dueDate:    [''],
    projectId:  [''],
  });

  narrativeForm = this.fb.group({
    narrative:        [''],
    challenges:       [''],
    lessonsLearned:   [''],
    nextPeriodPlans:  [''],
  });

  ngOnInit() {
    const projectId = this.route.snapshot.queryParamMap.get('projectId');
    if (projectId) this.filterProjectId.set(projectId);
    this.load();
  }

  load() {
    this.loading.set(true);
    const params: any = {};
    if (this.filterProjectId()) params.projectId = this.filterProjectId();
    this.api.reportingPeriods(params).subscribe({
      next: res => { this.periods.set(res.data); this.loading.set(false); },
      error: err => { this.error.set(err.error?.message || 'Load failed'); this.loading.set(false); }
    });
  }

  createPeriod() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createReportingPeriod(this.form.value as CreateReportingPeriodDto).subscribe({
      next: p => {
        this.periods.update(arr => [p, ...arr]);
        this.form.reset({ frequency: 'quarterly' });
        this.showForm.set(false);
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Failed'); this.saving.set(false); }
    });
  }

  selectPeriod(p: ReportingPeriod) {
    this.selected.set(p);
    this.activeTab.set('results');
    this.narrativeForm.patchValue({
      narrative:       p.narrative ?? '',
      challenges:      p.challenges ?? '',
      lessonsLearned:  p.lessonsLearned ?? '',
      nextPeriodPlans: p.nextPeriodPlans ?? '',
    });
    this.loadDQ(p);
  }

  loadDQ(p: ReportingPeriod) {
    if (!p.projectId) return;
    this.api.dataQualityReport(p.projectId, p._id).subscribe({
      next: (r: DataQualityReport) => this.dqReport.set(r),
      error: () => this.dqReport.set(null),
    });
  }

  calculate() {
    const p = this.selected();
    if (!p) return;
    this.calculating.set(true);
    this.api.calculatePeriodResults(p._id).subscribe({
      next: updated => {
        this.selected.set(updated);
        this.periods.update(arr => arr.map(x => x._id === updated._id ? updated : x));
        this.calculating.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Calculation failed'); this.calculating.set(false); }
    });
  }

  updateResult(indicatorId: string, field: 'achievedValue' | 'narrative', value: any) {
    const p = this.selected();
    if (!p) return;
    this.api.updateIndicatorResult(p._id, { indicatorId, [field]: value }).subscribe({
      next: updated => {
        this.selected.set(updated);
        this.periods.update(arr => arr.map(x => x._id === updated._id ? updated : x));
      },
      error: err => this.error.set(err.error?.message || 'Save failed')
    });
  }

  saveNarrative() {
    const p = this.selected();
    if (!p) return;
    this.saving.set(true);
    // patch narrative fields onto the period — reuse updatePeriodStatus endpoint
    // or a dedicated PATCH endpoint; here we send to the results endpoint
    this.api.updatePeriodStatus(p._id, p.status, JSON.stringify(this.narrativeForm.value)).subscribe({
      next: updated => { this.selected.set(updated); this.saving.set(false); },
      error: () => this.saving.set(false)
    });
  }

  changeStatus(newStatus: ReportingPeriodStatus) {
    const p = this.selected();
    if (!p) return;
    if (!confirm(`${newStatus === 'locked' ? '🔒 Lock' : 'Change status to'} "${newStatus}"? This cannot be undone for locking.`)) return;
    this.api.updatePeriodStatus(p._id, newStatus).subscribe({
      next: updated => {
        this.selected.set(updated);
        this.periods.update(arr => arr.map(x => x._id === updated._id ? updated : x));
      },
      error: err => this.error.set(err.error?.message || 'Status update failed')
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
        a.download = `${p.name}-report.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: () => this.error.set('Export failed. Feature may require backend implementation.')
    });
  }

  statusBadge(status: ReportingPeriodStatus): string {
    const map: Record<ReportingPeriodStatus, string> = {
      open: 'badge-blue', submitted: 'badge-yellow', approved: 'badge-green', locked: 'badge-dark'
    };
    return map[status] ?? 'badge-gray';
  }

  dqSeverityClass(severity: string) {
    return { low: 'text-yellow', medium: 'text-orange', high: 'text-red' }[severity] ?? '';
  }

  canCalculate = computed(() => {
    const p = this.selected();
    return p && p.status === 'open' && this.canManage();
  });
  canSubmit = computed(() => {
    const p = this.selected();
    return p && p.status === 'open' && this.canManage();
  });
  canApproveSelected = computed(() => {
    const p = this.selected();
    return p && p.status === 'submitted' && this.canApprove();
  });
  canLock = computed(() => {
    const p = this.selected();
    return p && p.status === 'approved' && this.canApprove();
  });
  isLocked = computed(() => this.selected()?.status === 'locked');
}