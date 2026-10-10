import { CommonModule } from '@angular/common';
import { Component, DestroyRef, OnInit, inject, signal } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { formatHttpError } from '../../core/http-error';
import { Project } from '../../core/models';
import { canManageProjects } from '../../core/roles';
import { AuthService } from '../../core/auth.service';
import { PagerComponent } from '../../shared/pager/pager.component';

type SortField = 'name' | 'sector' | 'donor' | 'status' | 'endDate' | 'totalBudget';

const STATUS_TABS = [
  { key: '', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'pipeline', label: 'Pipeline' },
  { key: 'design', label: 'Design' },
  { key: 'paused', label: 'Paused' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
] as const;

const SECTORS: Array<[string, string]> = [
  ['health', 'Health'], ['education', 'Education'], ['wash', 'WASH'], ['food_security', 'Food security'],
  ['livelihoods', 'Livelihoods'], ['protection', 'Protection'], ['shelter', 'Shelter'], ['nutrition', 'Nutrition'],
  ['gender', 'Gender'], ['environment', 'Environment'], ['governance', 'Governance'], ['peacebuilding', 'Peacebuilding'],
  ['drr', 'Disaster risk reduction'], ['economic_development', 'Economic development'], ['social_cohesion', 'Social cohesion'],
  ['mental_health', 'Mental health'], ['refugee_response', 'Refugee response'], ['other', 'Other'],
];

@Component({
  selector: 'app-projects-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, PagerComponent],
  templateUrl: './projects-list.component.html',
  styleUrls: ['./projects-list.component.scss'],
})
export class ProjectsListComponent implements OnInit {
  readonly statusTabs = STATUS_TABS;
  readonly sectors = SECTORS;
  readonly pageSize = 25;

  projects = signal<Project[]>([]);
  total = signal(0);
  page = signal(1);
  statusCounts = signal<Record<string, number>>({});
  loading = signal(true);
  loadError = signal('');
  showForm = signal(false);
  saving = signal(false);
  formError = signal('');

  search = signal('');
  statusFilter = signal('');
  sectorFilter = signal('');
  sortField = signal<SortField>('name');
  sortDescending = signal(false);

  form = { name: '', donor: '', description: '', startDate: '', endDate: '' };

  private readonly searchInput = new Subject<string>();
  private readonly destroyRef = inject(DestroyRef);

  constructor(
    private readonly api: ApiService,
    readonly auth: AuthService,
    private readonly router: Router,
  ) {
    this.searchInput
      .pipe(debounceTime(300), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((term) => {
        this.search.set(term);
        this.reload();
      });
  }

  get canCreateProjects() {
    return canManageProjects(this.auth.user()?.role ?? 'viewer');
  }

  get hasFilters() {
    return !!this.search() || !!this.statusFilter() || !!this.sectorFilter();
  }

  /** Projects across every status, under the current search and sector. */
  get allCount() {
    return Object.values(this.statusCounts()).reduce((sum, n) => sum + n, 0);
  }

  statusCount(status: string): number {
    return this.statusCounts()[status] ?? 0;
  }

  ngOnInit() {
    this.loadProjects();
  }

  loadProjects() {
    this.loading.set(true);
    this.loadError.set('');
    this.api
      .projectsPage({
        page: this.page(),
        limit: this.pageSize,
        status: this.statusFilter(),
        sector: this.sectorFilter(),
        search: this.search().trim(),
        sort: (this.sortDescending() ? '-' : '') + this.sortField(),
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (res) => {
          this.projects.set(res.data);
          this.total.set(res.total);
          this.statusCounts.set(res.statusCounts ?? {});
          this.loading.set(false);
        },
        // A swallowed error rendered the same empty state as "no projects",
        // so a failed request was indistinguishable from an empty workspace.
        error: (err) => {
          this.loadError.set(formatHttpError(err, 'Could not load projects. Check your connection and try again.'));
          this.loading.set(false);
        },
      });
  }

  /** Any change of filter or sort starts again from the first page. */
  private reload() {
    this.page.set(1);
    this.loadProjects();
  }

  onSearch(term: string) {
    this.searchInput.next(term);
  }

  setStatus(status: string) {
    this.statusFilter.set(status);
    this.reload();
  }

  setSector(sector: string) {
    this.sectorFilter.set(sector);
    this.reload();
  }

  sortBy(field: SortField) {
    if (this.sortField() === field) {
      this.sortDescending.update((d) => !d);
    } else {
      this.sortField.set(field);
      this.sortDescending.set(field === 'totalBudget');
    }
    this.reload();
  }

  ariaSort(field: SortField): 'ascending' | 'descending' | 'none' {
    return this.sortField() !== field ? 'none' : this.sortDescending() ? 'descending' : 'ascending';
  }

  clearFilters() {
    this.search.set('');
    this.statusFilter.set('');
    this.sectorFilter.set('');
    this.reload();
  }

  goToPage(page: number) {
    this.page.set(page);
    this.loadProjects();
  }

  sectorLabel(sector?: string): string {
    return SECTORS.find(([key]) => key === sector)?.[1] ?? '—';
  }

  /** Share of the project's timeline that has elapsed, 0–100; null without both dates. */
  elapsedPct(project: Project): number | null {
    if (!project.startDate || !project.endDate) return null;
    const start = new Date(project.startDate).getTime();
    const end = new Date(project.endDate).getTime();
    if (!(end > start)) return null;
    return Math.round(Math.min(1, Math.max(0, (Date.now() - start) / (end - start))) * 100);
  }

  /** What the end date means for a project that is still running. */
  timeLeft(project: Project): { text: string; tone: 'ok' | 'soon' | 'late' } | null {
    if (!project.endDate || !['active', 'paused'].includes(project.status)) return null;
    const days = Math.ceil((new Date(project.endDate).getTime() - Date.now()) / 86_400_000);
    if (days < 0) return { text: `${-days}d past end date`, tone: 'late' };
    if (days <= 90) return { text: `${days}d left`, tone: 'soon' };
    return { text: days > 365 ? `${Math.round(days / 30)} months left` : `${days}d left`, tone: 'ok' };
  }

  toggleForm() {
    this.showForm.update((v) => !v);
    this.formError.set('');
  }

  canCreate(): boolean {
    const { name, startDate, endDate } = this.form;
    return !!name.trim() && (!startDate || !endDate || endDate >= startDate);
  }

  createProject() {
    if (!this.canCreate() || this.saving()) return;
    this.saving.set(true);
    this.formError.set('');
    this.api
      .createProject({
        name: this.form.name.trim(),
        donor: this.form.donor.trim() || undefined,
        description: this.form.description.trim() || undefined,
        startDate: this.form.startDate || undefined,
        endDate: this.form.endDate || undefined,
      })
      .subscribe({
        // Straight into the new project: in a sorted, paged list it could
        // land on any page, and the next step is setting it up anyway.
        next: (created) => {
          this.saving.set(false);
          this.router.navigate(['/projects', created._id]);
        },
        error: (err) => {
          this.formError.set(formatHttpError(err, 'Could not create the project'));
          this.saving.set(false);
        },
      });
  }
}
