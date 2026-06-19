import { CurrencyPipe, DatePipe, DecimalPipe, NgClass, PercentPipe } from '@angular/common';
import { Component, OnInit, computed, signal, AfterViewInit } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DashboardOverview, Project, WorkflowSummary } from '../../core/models';
import { canManageProjects } from '../../core/roles';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe, DecimalPipe, CurrencyPipe, PercentPipe, NgClass],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit, AfterViewInit {
  projects        = signal<Project[]>([]);
  overview        = signal<DashboardOverview | null>(null);
  workflowSummary = signal<WorkflowSummary | null>(null);
  myTasks         = signal<any[]>([]);
  showForm        = signal(false);
  saving          = signal(false);
  animated        = signal(false);

  readonly greeting = computed(() => {
    const h    = new Date().getHours();
    const name = this.auth.user()?.name?.split(' ')[0] ?? '';
    if (h < 12) return `Good morning${name ? ', ' + name : ''}`;
    if (h < 17) return `Good afternoon${name ? ', ' + name : ''}`;
    return `Good evening${name ? ', ' + name : ''}`;
  });

  readonly today = new Date();

  // Project status breakdown from all projects
  readonly projectStatusCounts = computed(() => {
    const counts = this.overview()?.projectStatusCounts ?? {};
    return {
      active:    counts['active']    ?? 0,
      completed: counts['completed'] ?? 0,
      paused:    counts['paused']    ?? 0,
      draft:     counts['draft']     ?? 0,
      total:     this.overview()?.counts.projects ?? 0,
    };
  });

  readonly projectsDueSoon = computed(() =>
    this.projects()
      .filter(p => p.status === 'active')
      .map(p => ({ ...p, daysRemaining: this.getProjectDaysRemaining(p) }))
      .filter(p => p.daysRemaining !== null && p.daysRemaining <= 30)
      .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0))
      .slice(0, 5),
  );

  readonly qualityAlerts = computed(() =>
    (this.overview()?.qualityAlerts ?? []).slice(0, 6)
  );

  readonly pendingTaskCount = computed(() => this.myTasks().length);

  // Indicator achievement ring data
  readonly indicatorTotal = computed(() => {
    const ia = this.overview()?.indicatorAchievement;
    if (!ia) return 0;
    return ia.onTarget + ia.atRisk + ia.critical + ia.noData;
  });

  readonly indicatorOnTargetPct = computed(() => {
    const total = this.indicatorTotal();
    if (!total) return 0;
    return Math.round(((this.overview()?.indicatorAchievement?.onTarget ?? 0) / total) * 100);
  });

  // Grant burn rate ring
  readonly burnRateClass = computed(() => {
    const r = this.overview()?.grants?.burnRate ?? 0;
    if (r >= 90) return 'burn-critical';
    if (r >= 75) return 'burn-warning';
    return 'burn-ok';
  });

  form = { name: '', donor: '', description: '', startDate: '', endDate: '' };

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {}

  get canCreateProjects() {
    return canManageProjects(this.auth.user()?.role ?? 'viewer');
  }

  getRingDash(value: number, total: number, r = 28): string {
    const circumference = 2 * Math.PI * r;
    const filled = total > 0 ? (value / total) * circumference : 0;
    return `${filled.toFixed(2)} ${(circumference - filled).toFixed(2)}`;
  }

  getStatusPct(value: number, total: number): number {
    return total > 0 ? Math.round((value / total) * 100) : 0;
  }

  ngOnInit() { this.reload(); }

  ngAfterViewInit() {
    requestAnimationFrame(() => setTimeout(() => this.animated.set(true), 60));
  }

  reload() {
    this.api.projects().subscribe((res: any) =>
      this.projects.set(Array.isArray(res) ? res : (res.data ?? []))
    );
    this.api.dashboardOverview().subscribe({
      next:  o => this.overview.set(o),
      error: () => this.overview.set(null),
    });
    this.api.workflowSummary().subscribe({
      next:  s => this.workflowSummary.set(s),
      error: () => {},
    });
    this.api.myWorkflowTasks().subscribe({
      next:  t => this.myTasks.set(t),
      error: () => {},
    });
  }

  getProjectDaysRemaining(project: Project) {
    if (!project.endDate) return null;
    const diff = Math.ceil((new Date(project.endDate).getTime() - Date.now()) / 86400000);
    return diff >= 0 ? diff : 0;
  }

  formatCurrency(amount: number, currency = 'USD'): string {
    if (amount >= 1_000_000) return `$${(amount / 1_000_000).toFixed(1)}M`;
    if (amount >= 1_000)     return `$${(amount / 1_000).toFixed(0)}K`;
    return `$${amount.toLocaleString()}`;
  }

  toggleForm() { this.showForm.update(v => !v); }

  createProject() {
    this.saving.set(true);
    this.api.createProject({
      name:        this.form.name,
      donor:       this.form.donor       || undefined,
      description: this.form.description || undefined,
      startDate:   this.form.startDate   || undefined,
      endDate:     this.form.endDate     || undefined,
    }).subscribe({
      next: () => {
        this.saving.set(false);
        this.showForm.set(false);
        this.form = { name: '', donor: '', description: '', startDate: '', endDate: '' };
        this.reload();
      },
      error: () => this.saving.set(false),
    });
  }
}