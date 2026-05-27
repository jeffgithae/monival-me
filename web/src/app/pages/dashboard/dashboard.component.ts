import { DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { DashboardOverview, Project, QualityAlert } from '../../core/models';
import { canManageProjects } from '../../core/roles';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [RouterLink, FormsModule, DatePipe],
  templateUrl: './dashboard.component.html',
  styleUrl: './dashboard.component.scss',
})
export class DashboardComponent implements OnInit {
  projects = signal<Project[]>([]);
  overview = signal<DashboardOverview | null>(null);
  showForm = signal(false);
  saving = signal(false);

  readonly projectStatusCounts = computed(() => ({
    active: this.projects().filter((project) => project.status === 'active').length,
    completed: this.projects().filter((project) => project.status === 'completed').length,
    paused: this.projects().filter((project) => project.status === 'paused').length,
    total: this.projects().length,
  }));

  readonly projectsDueSoon = computed(() =>
    this.projects()
      .map((project) => ({
        ...project,
        daysRemaining: this.getProjectDaysRemaining(project),
      }))
      .filter((project) => project.daysRemaining !== null && project.daysRemaining <= 30)
      .sort((a, b) => (a.daysRemaining ?? 0) - (b.daysRemaining ?? 0)),
  );

  readonly qualityAlerts = computed(() => this.overview()?.qualityAlerts ?? []);

  form = {
    name: '',
    donor: '',
    description: '',
    startDate: '',
    endDate: '',
  };

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
  ) {}

  get canCreateProjects() {
    return canManageProjects(this.auth.user()?.role ?? 'viewer');
  }

  ngOnInit() {
    this.reload();
  }

  reload() {
    this.api.projects().subscribe((items) => this.projects.set(items));
    this.api.dashboardOverview().subscribe({
      next: (o) => this.overview.set(o),
      error: () => this.overview.set(null),
    });
  }

  getProjectDaysRemaining(project: Project) {
    if (!project.endDate) {
      return null;
    }
    const end = new Date(project.endDate);
    const diff = Math.ceil((end.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    return diff >= 0 ? diff : 0;
  }

  toggleForm() {
    this.showForm.update((v) => !v);
  }

  createProject() {
    this.saving.set(true);
    this.api
      .createProject({
        name: this.form.name,
        donor: this.form.donor || undefined,
        description: this.form.description || undefined,
        startDate: this.form.startDate || undefined,
        endDate: this.form.endDate || undefined,
      })
      .subscribe({
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
