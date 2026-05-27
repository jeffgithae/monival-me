import { NgFor, NgIf, DatePipe } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { Project } from '../../core/models';
import { canManageProjects } from '../../core/roles';
import { AuthService } from '../../core/auth.service';

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [NgIf, NgFor, RouterLink, DatePipe, FormsModule],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss'],
})
export class ProjectsListComponent implements OnInit {
  projects = signal<Project[]>([]);
  loading = signal(true);
  showForm = signal(false);
  saving = signal(false);
  search = signal('');
  statusFilter = signal<'all' | 'active' | 'completed' | 'paused'>('all');

  filteredProjects = computed(() => {
    const query = this.search().trim().toLowerCase();
    return this.projects().filter((project) => {
      const matchesStatus =
        this.statusFilter() === 'all' || project.status === this.statusFilter();
      const matchesQuery =
        !query ||
        project.name.toLowerCase().includes(query) ||
        (project.donor?.toLowerCase().includes(query) ?? false);
      return matchesStatus && matchesQuery;
    });
  });

  projectCounts = computed(() => ({
    total: this.projects().length,
    active: this.projects().filter((p) => p.status === 'active').length,
    completed: this.projects().filter((p) => p.status === 'completed').length,
    paused: this.projects().filter((p) => p.status === 'paused').length,
  }));

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
    this.loadProjects();
  }

  loadProjects() {
    this.loading.set(true);
    this.api.projects().subscribe({
      next: (items) => {
        this.projects.set(items);
        this.loading.set(false);
      },
      error: () => this.loading.set(false),
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

  getProjectTimeline(project: Project) {
    if (!project.startDate && !project.endDate) {
      return 'Dates not set';
    }
    return `${project.startDate ? new Date(project.startDate).toLocaleDateString() : 'TBA'} – ${project.endDate ? new Date(project.endDate).toLocaleDateString() : 'TBA'}`;
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
          this.loadProjects();
        },
        error: () => this.saving.set(false),
      });
  }
}
