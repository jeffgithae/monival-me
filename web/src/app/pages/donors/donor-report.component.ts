import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DonorReport, Project, ReportingPeriod } from '../../core/models';

@Component({
  selector: 'app-donor-report',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, DatePipe, DecimalPipe],
  templateUrl: './donor-report.component.html',
  styleUrl: './donor-report.component.scss',
})
export class DonorReportComponent implements OnInit {
  private api  = inject(ApiService);
  auth         = inject(AuthService);

  // Selection state
  projects        = signal<Project[]>([]);
  periods         = signal<ReportingPeriod[]>([]);
  selectedProject = signal('');
  selectedPeriod  = signal('');
  fromDate        = signal('');
  toDate          = signal('');
  filterMode      = signal<'period' | 'range'>('period');

  // Report state
  report      = signal<DonorReport | null>(null);
  loading     = signal(false);
  error       = signal('');
  exporting   = signal(false);
  generated   = signal(false);

  // Print/view state
  printMode = signal(false);

  org = computed(() => this.auth.organization());

  ngOnInit() {
    this.api.projects().subscribe({
      next: (res: any) => this.projects.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  onProjectChange() {
    this.selectedPeriod.set('');
    this.periods.set([]);
    this.report.set(null);
    this.generated.set(false);
    const pid = this.selectedProject();
    if (!pid) return;
    this.api.reportingPeriods({ projectId: pid }).subscribe({
      next: (res: any) => this.periods.set(Array.isArray(res) ? res : (res.data ?? [])),
      error: () => {},
    });
  }

  canGenerate = computed(() => {
    if (!this.selectedProject()) return false;
    if (this.filterMode() === 'period') return !!this.selectedPeriod();
    return !!(this.fromDate() && this.toDate());
  });

  generate() {
    if (!this.canGenerate()) return;
    this.loading.set(true);
    this.error.set('');
    this.report.set(null);

    const params: any = {};
    if (this.filterMode() === 'period') {
      params.reportingPeriodId = this.selectedPeriod();
    } else {
      params.fromDate = this.fromDate();
      params.toDate   = this.toDate();
    }

    this.api.donorReport(this.selectedProject(), params).subscribe({
      next: r => {
        this.report.set(r);
        this.generated.set(true);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to generate report');
        this.loading.set(false);
      },
    });
  }

  exportCsv() {
    if (!this.selectedProject()) return;
    this.exporting.set(true);
    const params: any = {};
    if (this.filterMode() === 'period' && this.selectedPeriod()) {
      params.reportingPeriodId = this.selectedPeriod();
    } else {
      if (this.fromDate()) params.fromDate = this.fromDate();
      if (this.toDate())   params.toDate   = this.toDate();
    }
    this.api.donorReportCsv(this.selectedProject(), params).subscribe({
      next: (blob: any) => {
        const url  = URL.createObjectURL(blob);
        const a    = document.createElement('a');
        a.href     = url;
        a.download = `donor-report-${this.report()?.project?.name ?? 'export'}-${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.exporting.set(false);
      },
      error: () => this.exporting.set(false),
    });
  }

  print() {
    this.printMode.set(true);
    setTimeout(() => {
      window.print();
      this.printMode.set(false);
    }, 200);
  }

  get selectedProjectObj(): Project | undefined {
    return this.projects().find(p => p._id === this.selectedProject());
  }

  get selectedPeriodObj(): ReportingPeriod | undefined {
    return this.periods().find(p => p._id === this.selectedPeriod());
  }

  progressClass(pct: number): string {
    if (pct >= 90) return 'on-track';
    if (pct >= 60) return 'at-risk';
    return 'behind';
  }

  progressLabel(pct: number): string {
    if (pct >= 90) return 'On Track';
    if (pct >= 60) return 'At Risk';
    return 'Behind';
  }

  statusLabel(s: string): string {
    const m: Record<string,string> = { active:'Active', completed:'Completed', paused:'Paused', planned:'Planned' };
    return m[s] ?? s;
  }

  indicatorForActivity(id?: string) {
    return this.report()?.indicators?.find(i => i.id === id);
  }

  isObject(v: unknown): boolean { return !!v && typeof v === 'object' && !Array.isArray(v); }
  objectEntries(o: Record<string, unknown>): [string, unknown][] { return Object.entries(o); }
}