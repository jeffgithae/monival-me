import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Grant, GrantSummary, CreateGrantDto, GrantStatus, Donor } from '../../core/models';
import { ConfirmService } from '../../shared/confirm.service';
import { ModalDirective } from '../../shared/a11y/modal.directive';

@Component({
  selector: 'app-grants-list',
  standalone: true,
  imports: [ModalDirective, CommonModule, RouterModule, FormsModule, ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './grant-list.component.html',
  styleUrl: './grant-list.component.scss',
})
export class GrantsListComponent implements OnInit {
  private confirmSvc = inject(ConfirmService);
  private api    = inject(ApiService);
  private auth   = inject(AuthService);
  private router = inject(Router);
  private fb     = inject(FormBuilder);

  grants       = signal<Grant[]>([]);
  summary      = signal<GrantSummary | null>(null);
  donors       = signal<Donor[]>([]);
  loading      = signal(true);
  error        = signal('');
  showForm     = signal(false);
  saving       = signal(false);
  deleting     = signal('');
  filterStatus = signal('');
  searchQuery  = signal('');
  page         = signal(1);
  total        = signal(0);
  limit        = 12;

  canCreate  = computed(() => this.auth.isOwner() || this.auth.isAdmin() || this.auth.isFinance());
  canDelete  = computed(() => this.auth.isOwner() || this.auth.isAdmin());

  readonly statuses: GrantStatus[] = ['prospect','applied','awarded','active','completed','closed','rejected'];
  readonly currencies = ['USD','KES','EUR','GBP','UGX','TZS','ZAR','NGN'];

  // Field names mirror CreateGrantDto exactly — the API rejects unknown keys
  // (forbidNonWhitelisted), so `referenceNumber`/`objectives`/`isRestricted`
  // are gone rather than silently dropped.
  form = this.fb.group({
    name:                 ['', Validators.required],
    donorId:              [''],
    status:               ['active' as GrantStatus],
    currency:             ['USD'],
    amount:               [0, [Validators.required, Validators.min(1)]],
    exchangeRate:         [null as number | null],
    startDate:            ['', Validators.required],
    endDate:              ['', Validators.required],
    description:          [''],
    parentGrantId:        [''],
    subRecipientName:     [''],
    fundClassification:   ['restricted'],
    indirectCostRate:     [0, [Validators.min(0), Validators.max(100)]],
    requiresMonthlyReporting: [false],
    requiresFinalReport:  [true],
  });

  // Edit state
  editing    = signal<Grant | null>(null);
  editForm   = this.fb.group({
    name:        ['', Validators.required],
    status:      ['active' as GrantStatus],
    amount:      [0, [Validators.min(0)]],
    amountSpent: [0, [Validators.min(0)]],
    currency:    ['USD'],
    startDate:   [''],
    endDate:     [''],
    description: [''],
    fundClassification: ['restricted'],
    indirectCostRate:   [0, [Validators.min(0), Validators.max(100)]],
  });

  ngOnInit() {
    this.load();
    this.api.donors().subscribe({
      next: (ds: any) => this.donors.set(Array.isArray(ds) ? ds : (ds.data ?? [])),
      error: () => {},
    });
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    const params: any = { page: this.page(), limit: this.limit };
    if (this.filterStatus()) params.status = this.filterStatus();
    if (this.searchQuery())  params.search = this.searchQuery();

    this.api.grants(params).subscribe({
      next: (res: any) => {
        const data  = Array.isArray(res) ? res : (res.data ?? []);
        const total = Array.isArray(res) ? res.length : (res.total ?? data.length);
        this.grants.set(data);
        this.total.set(total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load grants');
        this.loading.set(false);
      },
    });

    this.api.grantSummary().subscribe({ next: s => this.summary.set(s), error: () => {} });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    // Strip empty optionals — the API validates types, and '' is not a MongoId.
    const raw = this.form.value as Record<string, any>;
    const body: Record<string, any> = {};
    for (const [k, v] of Object.entries(raw)) {
      if (v !== '' && v !== null && v !== undefined) body[k] = v;
    }
    this.api.createGrant(body as CreateGrantDto).subscribe({
      next: () => {
        this.form.reset({
          status: 'active', currency: 'USD',
          fundClassification: 'restricted', indirectCostRate: 0, requiresFinalReport: true,
        });
        this.showForm.set(false);
        this.saving.set(false);
        this.page.set(1);
        this.load();
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to create grant');
        this.saving.set(false);
      },
    });
  }

  openEdit(g: Grant) {
    this.editing.set(g);
    this.editForm.patchValue({
      name:        g.name,
      status:      g.status ?? 'active',
      amount:      g.amount,
      amountSpent: g.amountSpent ?? 0,
      currency:    g.currency,
      startDate:   g.startDate?.slice(0, 10) ?? '',
      endDate:     g.endDate?.slice(0, 10) ?? '',
      description: g.description ?? '',
      fundClassification: g.fundClassification ?? 'restricted',
      indirectCostRate:   g.indirectCostRate ?? 0,
    });
  }

  saveEdit() {
    const g = this.editing();
    if (!g || this.editForm.invalid) return;
    this.saving.set(true);
    this.api.updateGrant(g._id, this.editForm.value as any).subscribe({
      next: () => { this.editing.set(null); this.saving.set(false); this.load(); },
      error: err => { this.error.set(err.error?.message || 'Update failed'); this.saving.set(false); },
    });
  }

  async deleteGrant(id: string, name: string) {
    if (!(await this.confirmSvc.ask({ title: `Delete "${name}"?`, message: `This cannot be undone.`, danger: true, confirmLabel: 'Delete' }))) return;
    this.deleting.set(id);
    this.api.deleteGrant(id).subscribe({
      next: () => { this.deleting.set(''); this.load(); },
      error: err => { this.error.set(err.error?.message || 'Delete failed'); this.deleting.set(''); },
    });
  }

  setFilter(status: string) { this.filterStatus.set(status); this.page.set(1); this.load(); }
  search()      { this.page.set(1); this.load(); }
  clearSearch() { this.searchQuery.set(''); this.page.set(1); this.load(); }
  nextPage()    { this.page.update(p => p + 1); this.load(); }
  prevPage()    { this.page.update(p => Math.max(1, p - 1)); this.load(); }
  openDetail(id: string) { this.router.navigate(['/grants', id]); }

  grantTitle(g: Grant)  { return g.name || '—'; }
  grantAmount(g: Grant) { return g.amount ?? 0; }
  grantSpent(g: Grant)  { return g.amountSpent ?? 0; }

  /**
   * Derived here rather than read off the record — the API never sent a
   * `daysUntilExpiry` field, so every card rendered a dash.
   */
  daysToExpiry(g: Grant): number {
    if (!g.endDate) return Number.NaN;
    return Math.ceil((new Date(g.endDate).getTime() - Date.now()) / 86_400_000);
  }

  burnRate(g: Grant): number {
    const total = this.grantAmount(g);
    return total > 0 ? Math.min((this.grantSpent(g) / total) * 100, 100) : 0;
  }

  burnClass(rate: number): string {
    if (rate >= 90) return 'crit';
    if (rate >= 70) return 'warn';
    return 'ok';
  }

  statusIcon(s: string): string {
    const m: Record<string, string> = {
      active: '🟢', prospect: '🔵', applied: '🟡', awarded: '🏆',
      completed: '✅', closed: '⭕', rejected: '❌',
    };
    return m[s] ?? '•';
  }

  daysLabel(days: number | undefined): string {
    if (days == null || Number.isNaN(days)) return '—';
    if (days < 0)   return 'Expired';
    if (days === 0) return 'Today';
    if (days <= 30) return `${days}d ⚠️`;
    return `${days}d`;
  }

  donorName(g: Grant): string {
    return typeof g.donorId === 'object' && g.donorId ? (g.donorId.name ?? '') : '';
  }

  get totalPages() { return Math.ceil(this.total() / this.limit) || 1; }
  get hasNext()    { return this.page() < this.totalPages; }
  get hasPrev()    { return this.page() > 1; }

  get filteredCounts() {
    const gs = this.grants();
    return {
      all:       this.total(),
      active:    gs.filter(g => g.status === 'active').length,
      expiring:  gs.filter(g => this.daysToExpiry(g) <= 30 && this.daysToExpiry(g) >= 0).length,
      overBudget: gs.filter(g => this.burnRate(g) >= 90).length,
    };
  }
}