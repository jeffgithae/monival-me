import { Component, OnInit, signal, computed } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ScheduledReport, ImportResult, Project, ReportCadence } from '../../core/models';

type Tab = 'scheduled' | 'import' | 'export';

@Component({
  selector: 'app-data-reporting',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe],
  templateUrl: './data-reporting.component.html',
  styleUrl: './data-reporting.component.scss',
})
export class DataReportingComponent implements OnInit {

  // ── State ─────────────────────────────────────────────────────────────────
  activeTab   = signal<Tab>('scheduled');
  loading     = signal(true);
  saving      = signal(false);
  error       = signal('');
  success     = signal('');

  projects         = signal<Project[]>([]);
  scheduledReports = signal<ScheduledReport[]>([]);
  importResult     = signal<ImportResult | null>(null);
  showScheduleForm = signal(false);
  editingId        = signal<string | null>(null);
  triggeringId     = signal<string | null>(null);

  // ── Scheduled report form ─────────────────────────────────────────────────
  schedForm = this.blankSchedForm();

  // ── Import state ──────────────────────────────────────────────────────────
  importKind: 'activities' | 'beneficiaries' = 'activities';
  importProjectId = '';
  importFile: File | null = null;
  importing = signal(false);

  // ── Export state ──────────────────────────────────────────────────────────
  exportProjectId = '';
  exportPeriodId  = '';

  readonly cadenceOptions: { value: ReportCadence; label: string; desc: string }[] = [
    { value: 'daily',     label: 'Daily',     desc: 'Every morning at 8 AM' },
    { value: 'weekly',    label: 'Weekly',    desc: 'Every Monday at 8 AM' },
    { value: 'monthly',   label: 'Monthly',   desc: 'On chosen day each month' },
    { value: 'quarterly', label: 'Quarterly', desc: 'Every 3 months' },
  ];

  readonly importKinds = [
    {
      id: 'activities' as const,
      label: 'Activities',
      icon: '📋',
      desc: 'Bulk import field activity records',
      fields: ['title*', 'activityDate*', 'projectCode', 'indicatorCode', 'location', 'participants', 'quantity', 'evidenceUrl', 'evidenceNotes', 'description'],
    },
    {
      id: 'beneficiaries' as const,
      label: 'Beneficiaries',
      icon: '👥',
      desc: 'Bulk import beneficiary registrations',
      fields: ['name*', 'registrationType', 'sex', 'age', 'dateOfBirth', 'nationality', 'country', 'district', 'location', 'householdSize', 'hasDisability', 'isIdp', 'isRefugee', 'consentGiven', 'status'],
    },
  ];

  readonly canManage = computed(() => {
    const r = this.auth.user()?.role;
    return r === 'owner' || r === 'admin';
  });

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {}

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
    this.api.scheduledReports().subscribe({
      next: r => { this.scheduledReports.set(r); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  // ── Scheduled reports ─────────────────────────────────────────────────────

  openCreateSchedule() {
    this.schedForm = this.blankSchedForm();
    this.editingId.set(null);
    this.showScheduleForm.set(true);
  }

  openEditSchedule(r: ScheduledReport) {
    this.editingId.set(r._id);
    this.schedForm = {
      projectId:    r.projectId,
      name:         r.name,
      recipients:   r.recipients.join(', '),
      cadence:      r.cadence,
      dayOfMonth:   r.dayOfMonth,
      includeCsv:   r.includeCsv,
      isActive:     r.isActive,
    };
    this.showScheduleForm.set(true);
  }

  saveSchedule() {
    this.saving.set(true);
    this.error.set('');
    const dto = {
      ...this.schedForm,
      recipients: this.schedForm.recipients.split(',').map((e: string) => e.trim()).filter(Boolean),
    };
    const obs = this.editingId()
      ? this.api.updateScheduledReport(this.editingId()!, dto)
      : this.api.createScheduledReport(dto as any);

    obs.subscribe({
      next: () => {
        this.saving.set(false);
        this.showScheduleForm.set(false);
        this.editingId.set(null);
        this.success.set('Scheduled report saved successfully.');
        this.loadAll();
        setTimeout(() => this.success.set(''), 4000);
      },
      error: (e: any) => { this.saving.set(false); this.error.set(e?.error?.message ?? 'Failed to save'); },
    });
  }

  deleteSchedule(r: ScheduledReport) {
    if (!confirm(`Delete "${r.name}"? Recipients will stop receiving this report.`)) return;
    this.api.deleteScheduledReport(r._id).subscribe({
      next: () => this.loadAll(),
      error: (e: any) => this.error.set(e?.error?.message ?? 'Delete failed'),
    });
  }

  toggleActive(r: ScheduledReport) {
    this.api.updateScheduledReport(r._id, { isActive: !r.isActive }).subscribe({
      next: () => this.loadAll(),
      error: (e: any) => this.error.set(e?.error?.message ?? 'Update failed'),
    });
  }

  triggerNow(r: ScheduledReport) {
    this.triggeringId.set(r._id);
    this.api.triggerScheduledReport(r._id).subscribe({
      next: () => {
        this.triggeringId.set(null);
        this.success.set(`Report "${r.name}" triggered — emails will be sent shortly.`);
        setTimeout(() => this.success.set(''), 5000);
        this.loadAll();
      },
      error: (e: any) => { this.triggeringId.set(null); this.error.set(e?.error?.message ?? 'Trigger failed'); },
    });
  }

  cancelScheduleForm() {
    this.showScheduleForm.set(false);
    this.editingId.set(null);
    this.error.set('');
  }

  // ── Bulk import ───────────────────────────────────────────────────────────

  onFileChange(event: Event) {
    const input = event.target as HTMLInputElement;
    this.importFile = input.files?.[0] ?? null;
  }

  downloadTemplate(kind: string) {
    this.api.importTemplate(kind).subscribe({
      next: (csv: string) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `${kind}-import-template.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e: any) => this.error.set(e?.error?.message ?? 'Download failed'),
    });
  }

  runImport() {
    if (!this.importFile) return;
    this.importing.set(true);
    this.importResult.set(null);
    this.error.set('');
    this.api.bulkImport(this.importKind, this.importFile, this.importProjectId || undefined).subscribe({
      next: (result: ImportResult) => {
        this.importing.set(false);
        this.importResult.set(result);
      },
      error: (e: any) => { this.importing.set(false); this.error.set(e?.error?.message ?? 'Import failed'); },
    });
  }

  // ── Export ────────────────────────────────────────────────────────────────

  exportDonorReport() {
    if (!this.exportProjectId) return;
    const params: any = {};
    if (this.exportPeriodId) params.reportingPeriodId = this.exportPeriodId;
    this.api.donorReportCsv(this.exportProjectId, params).subscribe({
      next: (csv: any) => {
        const blob = new Blob([csv], { type: 'text/csv' });
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `donor-report-${this.exportProjectId}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      },
      error: (e: any) => this.error.set(e?.error?.message ?? 'Export failed'),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  projectName(id: string) {
    return this.projects().find(p => p._id === id)?.name ?? id;
  }

  cadenceLabel(c: string) {
    return this.cadenceOptions.find(o => o.value === c)?.label ?? c;
  }

  importKindMeta(id: string) {
    return this.importKinds.find(k => k.id === id);
  }

  private blankSchedForm() {
    return {
      projectId:  '',
      name:       '',
      recipients: '',
      cadence:    'monthly' as ReportCadence,
      dayOfMonth: 1,
      includeCsv: true,
      isActive:   true,
    };
  }
}