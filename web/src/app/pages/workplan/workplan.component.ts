import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Project, WorkplanItem, Indicator } from '../../core/models';

type StatusFilter = '' | 'planned' | 'in_progress' | 'completed' | 'delayed' | 'cancelled';
type ViewMode = 'board' | 'timeline' | 'table';

@Component({
  selector: 'app-workplan',
  standalone: true,
  imports: [CommonModule, FormsModule, ReactiveFormsModule, RouterModule, DatePipe, DecimalPipe],
  templateUrl: './workplan.component.html',
  styleUrl:    './workplan.component.scss',
})
export class WorkplanComponent implements OnInit {
  private api = inject(ApiService);
  auth        = inject(AuthService);
  private fb  = inject(FormBuilder);

  // Data
  projects    = signal<Project[]>([]);
  indicators  = signal<Indicator[]>([]);
  members     = signal<Array<{ id: string; userId: string; email: string; name: string; role: string }>>([]);
  loading     = signal(true);
  error       = signal('');
  saving      = signal(false);
  deleting    = signal('');

  // Selection
  selectedProjectId = signal('');
  selectedProject   = computed(() => this.projects().find(p => p._id === this.selectedProjectId()));
  workplanItems     = computed(() => this.selectedProject()?.workplan ?? []);

  // Filters & view
  statusFilter   = signal('');
  viewMode       = signal<ViewMode>('board');
  searchQuery    = signal('');

  // Panels
  showCreatePanel = signal(false);
  editingItem     = signal<WorkplanItem | null>(null);

  canManage = computed(() =>
    this.auth.isOwner() || this.auth.isAdmin() || this.auth.isMEOfficer()
  );

  readonly statuses: Array<{ value: string; label: string; icon: string; color: string }> = [
    { value: 'planned',     label: 'Planned',     icon: '⏳', color: 'planned'     },
    { value: 'in_progress', label: 'In Progress', icon: '🔄', color: 'in-progress'  },
    { value: 'completed',   label: 'Completed',   icon: '✅', color: 'completed'   },
    { value: 'delayed',     label: 'Delayed',     icon: '⚠️', color: 'delayed'     },
    { value: 'cancelled',   label: 'Cancelled',   icon: '❌', color: 'cancelled'   },
  ];

  readonly quarters = ['Q1', 'Q2', 'Q3', 'Q4'];

  form = this.fb.group({
    title:            ['', Validators.required],
    description:      [''],
    startDate:        ['', Validators.required],
    endDate:          ['', Validators.required],
    status:           ['planned'],
    progressPct:      [0, [Validators.min(0), Validators.max(100)]],
    quarter:          [''],
    responsibleName:  [''],
    estimatedCost:    [null as number | null],
    actualCost:       [null as number | null],
    outputDescription: [''],
    linkedIndicatorIds: [[] as string[]],
  });

  filteredItems = computed(() => {
    let items = this.workplanItems();
    const q = this.searchQuery().toLowerCase();
    const s = this.statusFilter() as string;
    if (q) items = items.filter(i =>
      i.title.toLowerCase().includes(q) ||
      i.description?.toLowerCase().includes(q) ||
      i.responsibleName?.toLowerCase().includes(q) ||
      i.quarter?.toLowerCase().includes(q)
    );
    if (s) items = items.filter(i => i.status === s);
    return items;
  });

  boardColumns = computed(() =>
    this.statuses.map(s => ({
      ...s,
      items: this.filteredItems().filter(i => i.status === s.value),
    }))
  );

  summary = computed(() => {
    const items = this.workplanItems();
    const total = items.length;
    const completed  = items.filter(i => i.status === 'completed').length;
    const inProgress = items.filter(i => i.status === 'in_progress').length;
    const delayed    = items.filter(i => i.status === 'delayed').length;
    const planned    = items.filter(i => i.status === 'planned').length;
    const totalCost  = items.reduce((s, i) => s + (i.estimatedCost ?? 0), 0);
    const actualCost = items.reduce((s, i) => s + (i.actualCost ?? 0), 0);
    const avgProgress = total > 0
      ? Math.round(items.reduce((s, i) => s + i.progressPct, 0) / total) : 0;
    return { total, completed, inProgress, delayed, planned, totalCost, actualCost, avgProgress };
  });

  statusCounts = computed(() => {
    const items = this.workplanItems();
    const counts: Record<string, number> = { '': items.length };
    for (const s of this.statuses) counts[s.value] = items.filter(i => i.status === s.value).length;
    return counts;
  });

  // Timeline: group by quarter, then by month
  timelineGroups = computed(() => {
    const items = this.filteredItems();
    const groups: Record<string, WorkplanItem[]> = {};
    for (const item of items) {
      const key = item.quarter ?? this.inferQuarter(item.startDate);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  });

  ngOnInit() {
    this.api.projects().subscribe({
      next: (res: any) => {
        const ps = Array.isArray(res) ? res : (res.data ?? []);
        this.projects.set(ps);
        if (ps.length > 0) this.selectProject(ps[0]._id);
        else this.loading.set(false);
      },
      error: () => this.loading.set(false),
    });
    this.api.members().subscribe({
      next: (res: any) => this.members.set(Array.isArray(res) ? res : []),
      error: () => {},
    });
  }

  selectProject(id: string) {
    this.selectedProjectId.set(id);
    this.error.set('');
    this.loading.set(true);
    this.api.project(id).subscribe({
      next: project => {
        this.projects.update(ps => ps.map(p => p._id === id ? project : p));
        this.loading.set(false);
        // Load indicators for this project
        this.api.indicators(id).subscribe({
          next: inds => this.indicators.set(inds),
          error: () => {},
        });
      },
      error: err => { this.error.set(err.error?.message || 'Failed to load project'); this.loading.set(false); },
    });
  }

  openCreate() {
    this.form.reset({ status: 'planned', progressPct: 0, linkedIndicatorIds: [] });
    this.editingItem.set(null);
    this.showCreatePanel.set(true);
  }

  openEdit(item: WorkplanItem) {
    this.editingItem.set(item);
    this.showCreatePanel.set(true);
    this.form.patchValue({
      title:             item.title,
      description:       item.description ?? '',
      startDate:         item.startDate?.slice(0, 10) ?? '',
      endDate:           item.endDate?.slice(0, 10) ?? '',
      status:            item.status,
      progressPct:       item.progressPct,
      quarter:           item.quarter ?? '',
      responsibleName:   item.responsibleName ?? '',
      estimatedCost:     item.estimatedCost ?? null,
      actualCost:        item.actualCost ?? null,
      outputDescription: item.outputDescription ?? '',
      linkedIndicatorIds: item.linkedIndicatorIds ?? [],
    });
  }

  saveItem() {
    if (this.form.invalid || !this.selectedProjectId()) return;
    this.saving.set(true);
    const pid = this.selectedProjectId();
    const dto = { ...this.form.value } as any;
    if (!dto.estimatedCost) delete dto.estimatedCost;
    if (!dto.actualCost)    delete dto.actualCost;

    const editing = this.editingItem();
    const req = editing
      ? this.api.updateWorkplanItem(pid, editing._id, dto)
      : this.api.addWorkplanItem(pid, dto);

    req.subscribe({
      next: updated => {
        this.projects.update(ps => ps.map(p => p._id === pid ? updated : p));
        this.showCreatePanel.set(false);
        this.editingItem.set(null);
        this.saving.set(false);
      },
      error: err => { this.error.set(err.error?.message || 'Save failed'); this.saving.set(false); },
    });
  }

  deleteItem(item: WorkplanItem) {
    if (!confirm(`Delete "${item.title}"?`)) return;
    this.deleting.set(item._id);
    this.api.removeWorkplanItem(this.selectedProjectId(), item._id).subscribe({
      next: updated => {
        this.projects.update(ps => ps.map(p => p._id === this.selectedProjectId() ? updated : p));
        this.deleting.set('');
      },
      error: err => { this.error.set(err.error?.message || 'Delete failed'); this.deleting.set(''); },
    });
  }

  quickStatus(item: WorkplanItem, status: string) {
    const pid = this.selectedProjectId();
    const progressPct = status === 'completed' ? 100 : status === 'planned' ? 0 : item.progressPct;
    this.api.updateWorkplanItem(pid, item._id, { status: status as any, progressPct }).subscribe({
      next: updated => this.projects.update(ps => ps.map(p => p._id === pid ? updated : p)),
      error: err => this.error.set(err.error?.message || 'Update failed'),
    });
  }

  indicatorTitle(id: string): string {
    const ind = this.indicators().find(i => i._id === id);
    return ind ? (ind.code ? `${ind.code} – ${ind.title}` : ind.title) : id;
  }

  statusInfo(status: string) {
    return this.statuses.find(s => s.value === status) ?? this.statuses[0];
  }

  inferQuarter(dateStr?: string): string {
    if (!dateStr) return 'Unscheduled';
    const m = new Date(dateStr).getMonth();
    if (m < 3)  return 'Q1';
    if (m < 6)  return 'Q2';
    if (m < 9)  return 'Q3';
    return 'Q4';
  }

  daysLeft(endDate: string): number {
    return Math.ceil((new Date(endDate).getTime() - Date.now()) / 86400000);
  }

  daysLeftLabel(endDate: string): string {
    const d = this.daysLeft(endDate);
    if (d < 0)  return `${Math.abs(d)}d overdue`;
    if (d === 0) return 'Due today';
    return `${d}d left`;
  }

  daysLeftClass(item: WorkplanItem): string {
    if (item.status === 'completed' || item.status === 'cancelled') return '';
    const d = this.daysLeft(item.endDate);
    if (d < 0)  return 'overdue';
    if (d <= 7) return 'urgent';
    if (d <= 14) return 'soon';
    return '';
  }

  toggleIndicator(id: string) {
    const current = (this.form.get('linkedIndicatorIds')?.value as string[]) ?? [];
    const updated = current.includes(id)
      ? current.filter(i => i !== id)
      : [...current, id];
    this.form.get('linkedIndicatorIds')?.setValue(updated);
  }

  isLinked(id: string): boolean {
    return ((this.form.get('linkedIndicatorIds')?.value as string[]) ?? []).includes(id);
  }

  closePanel() { this.showCreatePanel.set(false); this.editingItem.set(null); }
}