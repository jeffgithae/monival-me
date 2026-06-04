import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Grant, GrantSummary, CreateGrantDto, GrantStatus, Donor } from '../../core/models';

@Component({
  selector: 'app-grants-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule, DecimalPipe, DatePipe],
  templateUrl: './grant-list.component.html',
})
export class GrantsListComponent implements OnInit {
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
  filterStatus = signal('');
  filterDonor  = signal('');
  page         = signal(1);
  total        = signal(0);
  limit        = 20;

  canCreate = computed(() => this.auth.isOwner() || this.auth.isAdmin() || this.auth.isFinance());

  readonly statuses: GrantStatus[] = ['prospect','applied','awarded','active','completed','closed','rejected'];
  readonly currencies = ['USD','KES','EUR','GBP','UGX','TZS','ZAR','NGN'];
  readonly frequencies = ['monthly','quarterly','semiannual','annual'];

  // Form uses API field names: title, totalAmount
  form = this.fb.group({
    title:              ['', Validators.required],
    referenceNumber:    [''],
    donorId:            [''],
    status:             ['active' as GrantStatus],
    currency:           ['USD'],
    totalAmount:        [0, [Validators.required, Validators.min(1)]],
    startDate:          ['', Validators.required],
    endDate:            ['', Validators.required],
    submissionDeadline: [''],
    reportingFrequency: ['quarterly'],
    objectives:         [''],
    isRestricted:       [false],
  });

  ngOnInit() {
    this.load();
    this.api.donors().subscribe({ next: ds => this.donors.set(ds), error: () => {} });
  }

  load() {
    this.loading.set(true);
    const params: any = { page: this.page(), limit: this.limit };
    if (this.filterStatus()) params.status  = this.filterStatus();
    if (this.filterDonor())  params.donorId = this.filterDonor();

    this.api.grants(params).subscribe({
      next: res => {
        const data = Array.isArray(res) ? res : res.data;
        this.grants.set(data);
        this.total.set(Array.isArray(res) ? data.length : res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load grants');
        this.loading.set(false);
      },
    });

    this.api.grantSummary().subscribe({ next: s => this.summary.set(s) });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createGrant(this.form.value as CreateGrantDto).subscribe({
      next: () => {
        this.form.reset({ status: 'active', currency: 'USD', isRestricted: false, reportingFrequency: 'quarterly' });
        this.showForm.set(false);
        this.saving.set(false);
        this.load();
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to create grant');
        this.saving.set(false);
      },
    });
  }

  nextPage()   { this.page.update(p => p + 1); this.load(); }
  prevPage()   { this.page.update(p => Math.max(1, p - 1)); this.load(); }
  applyFilter() { this.page.set(1); this.load(); }
  clearFilter() { this.filterStatus.set(''); this.filterDonor.set(''); this.applyFilter(); }
  openDetail(id: string) { this.router.navigate(['/grants', id]); }

  /** Returns display title — API returns `title`, older records may still have `name` */
  grantTitle(g: Grant): string { return g.title || g.name || '—'; }

  /** Effective amount — new field is totalAmount, old field was amount */
  grantAmount(g: Grant): number { return g.totalAmount ?? g.amount ?? 0; }

  /** Effective spent — new field is spentAmount, old field was amountSpent */
  grantSpent(g: Grant): number { return g.spentAmount ?? g.amountSpent ?? 0; }

  burnRate(g: Grant): number {
    const total = this.grantAmount(g);
    return total > 0 ? Math.min((this.grantSpent(g) / total) * 100, 100) : 0;
  }

  burnClass(rate: number): string {
    if (rate >= 90) return 'burn-critical';
    if (rate >= 75) return 'burn-warning';
    return 'burn-ok';
  }

  daysLabel(days: number | undefined): string {
    if (days == null) return '—';
    if (days < 0)  return 'Expired';
    if (days === 0) return 'Today';
    return `${days}d`;
  }

  donorName(g: Grant): string {
    return g.donorId?.name ?? g.donorName ?? '';
  }

  get totalPages() { return Math.ceil(this.total() / this.limit); }
  get hasNext()    { return this.page() < this.totalPages; }
  get hasPrev()    { return this.page() > 1; }
}