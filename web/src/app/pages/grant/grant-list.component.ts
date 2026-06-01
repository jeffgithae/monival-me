// web/src/app/pages/grants/grants-list.component.ts
import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { FormsModule, ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { Grant, GrantSummary, CreateGrantDto, GrantStatus } from '../../core/models';

@Component({
  selector: 'app-grants-list',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, ReactiveFormsModule],
  templateUrl: './grant-list.component.html',
})
export class GrantsListComponent implements OnInit {
  private api    = inject(ApiService);
  private auth   = inject(AuthService);
  private router = inject(Router);
  private fb     = inject(FormBuilder);

  grants    = signal<Grant[]>([]);
  summary   = signal<GrantSummary | null>(null);
  loading   = signal(true);
  error     = signal('');
  showForm  = signal(false);
  saving    = signal(false);
  filterStatus = signal<string>('');
  filterDonor  = signal<string>('');
  page      = signal(1);
  total     = signal(0);
  limit     = 20;

  // Computed helpers
  canCreate = computed(() => this.auth.isOwner() || this.auth.isAdmin() || this.auth.isFinance());

  statuses: GrantStatus[] = ['prospect','applied','awarded','active','closed','rejected'];
  currencies = ['USD','KES','EUR','GBP','UGX','TZS'];

  form = this.fb.group({
    title:              ['', Validators.required],
    referenceNumber:    [''],
    donorId:            [''],
    projectId:          [''],
    status:             ['prospect' as GrantStatus],
    currency:           ['USD'],
    totalAmount:        [0, [Validators.required, Validators.min(1)]],
    startDate:          ['', Validators.required],
    endDate:            ['', Validators.required],
    submissionDeadline: [''],
    reportingFrequency: ['quarterly'],
    description:        [''],
    objectives:         [''],
    isRestricted:       [false],
  });

  ngOnInit() { this.load(); }

  load() {
    this.loading.set(true);
    const params: any = { page: this.page(), limit: this.limit };
    if (this.filterStatus()) params.status = this.filterStatus();
    if (this.filterDonor())  params.donorId = this.filterDonor();

    this.api.grants(params).subscribe({
      next: res => {
        const grants = Array.isArray(res) ? res : res.data;
        this.grants.set(grants);
        this.total.set(Array.isArray(res) ? grants.length : res.total);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load grants');
        this.loading.set(false);
      }
    });

    this.api.grantSummary().subscribe({ next: s => this.summary.set(s) });
  }

  submit() {
    if (this.form.invalid) return;
    this.saving.set(true);
    this.api.createGrant(this.form.value as CreateGrantDto).subscribe({
      next: grant => {
        this.grants.update(g => [grant, ...g]);
        this.form.reset({ status: 'prospect', currency: 'USD', isRestricted: false });
        this.showForm.set(false);
        this.saving.set(false);
        this.load(); // refresh summary
      },
      error: err => {
        this.error.set(err.error?.message || 'Failed to create grant');
        this.saving.set(false);
      }
    });
  }

  nextPage()  { this.page.update(p => p + 1); this.load(); }
  prevPage()  { this.page.update(p => Math.max(1, p - 1)); this.load(); }
  applyFilter() { this.page.set(1); this.load(); }
  clearFilter() { this.filterStatus.set(''); this.filterDonor.set(''); this.applyFilter(); }
  openDetail(id: string) { this.router.navigate(['/grants', id]); }

  burnRateClass(rate: number): string {
    if (rate >= 90) return 'critical';
    if (rate >= 75) return 'warning';
    return 'ok';
  }

  statusBadgeClass(status: GrantStatus | undefined): string {
    if (!status) return 'badge-gray';
    const map: Record<GrantStatus, string> = {
      prospect: 'badge-gray', applied: 'badge-blue', awarded: 'badge-purple',
      active: 'badge-green', closed: 'badge-dark', rejected: 'badge-red',
      completed: 'badge-teal', pending: 'badge-yellow'
    };
    return map[status] ?? 'badge-gray';
  }

  daysLabel(days: number | undefined): string {
    if (days == null) return '—';
    if (days < 0)  return 'Expired';
    if (days === 0) return 'Today';
    return `${days}d`;
  }

  get totalPages() { return Math.ceil(this.total() / this.limit); }
  get hasNext()    { return this.page() < this.totalPages; }
  get hasPrev()    { return this.page() > 1; }
}