import { CommonModule, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BudgetAllocation, BudgetSummary } from '../../core/models';

@Component({
  selector: 'app-budget-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, FormsModule],
  templateUrl: './budget-list.component.html',
  styleUrl: './budget.scss',
})
export class BudgetListComponent implements OnInit {
  budgets  = signal<BudgetAllocation[]>([]);
  summary  = signal<BudgetSummary | null>(null);
  loading  = signal(true);
  error    = signal('');
  showForm = signal(false);
  isFinance = signal(false);

  readonly categories = [
    { value: 'operational', label: 'Operational' },
    { value: 'project',     label: 'Project' },
    { value: 'emergency',   label: 'Emergency' },
    { value: 'strategic',   label: 'Strategic' },
    { value: 'personnel',   label: 'Personnel' },
    { value: 'travel',      label: 'Travel' },
    { value: 'equipment',   label: 'Equipment' },
    { value: 'indirect',    label: 'Indirect' },
  ];

  filterStatus   = '';
  filterCategory = '';
  filterFiscalYear: number | null = null;

  newBudgetForm = {
    name: '',
    description: '',
    allocatedAmount: 0,
    currency: 'USD',
    category: 'operational',
    fiscalYear: new Date().getFullYear(),
    startDate: '',
    endDate: '',
    isRestricted: false,
  };

  // Summary derived values
  readonly totalAllocated  = computed(() => this.summary()?.totalAllocated ?? 0);
  readonly totalSpent      = computed(() => this.summary()?.totalSpent ?? 0);
  readonly totalCommitted  = computed(() => this.summary()?.totalCommitted ?? 0);
  readonly totalAvailable  = computed(() => this.summary()?.totalUncommitted ?? 0);
  readonly overallBurnRate = computed(() => this.summary()?.overallBurnRate ?? 0);
  readonly alertedBudgets  = computed(() => this.summary()?.alertedBudgets ?? 0);
  readonly primaryCurrency = computed(() => this.budgets()[0]?.currency ?? 'USD');

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    const role = this.auth.user()?.role;
    this.isFinance.set(role === 'admin' || role === 'owner' || role === 'finance');
  }

  ngOnInit() {
    this.loadAll();
  }

  loadAll() {
    this.loadBudgets();
    const orgId = this.auth.user()?.organizationId;
    if (orgId) {
      this.api.budgetSummary(orgId, {
        fiscalYear: this.filterFiscalYear ?? undefined,
      }).subscribe({ next: (s) => this.summary.set(s) });
    }
  }

  loadBudgets() {
    this.loading.set(true);
    const query: Record<string, any> = {};
    if (this.filterStatus)   query['status']     = this.filterStatus;
    if (this.filterCategory) query['category']   = this.filterCategory;
    if (this.filterFiscalYear) query['fiscalYear'] = this.filterFiscalYear;
    this.api.budgetAllocations(query).subscribe({
      next: (budgets) => { this.budgets.set(budgets); this.loading.set(false); },
      error: () => { this.error.set('Failed to load budgets'); this.loading.set(false); },
    });
  }

  createBudget() {
    const f = this.newBudgetForm;
    if (!f.name || f.allocatedAmount <= 0 || !f.startDate || !f.endDate) {
      this.error.set('Name, allocated amount, start date, and end date are required.');
      return;
    }
    this.error.set('');
    this.api.createBudgetAllocation({
      name: f.name,
      description: f.description || undefined,
      allocatedAmount: f.allocatedAmount,
      currency: f.currency,
      category: f.category,
      fiscalYear: f.fiscalYear,
      startDate: f.startDate,
      endDate: f.endDate,
      isRestricted: f.isRestricted,
    }).subscribe({
      next: () => { this.resetForm(); this.showForm.set(false); this.loadAll(); },
      error: () => this.error.set('Failed to create budget.'),
    });
  }

  resetForm() {
    this.newBudgetForm = {
      name: '', description: '', allocatedAmount: 0, currency: 'USD',
      category: 'operational', fiscalYear: new Date().getFullYear(),
      startDate: '', endDate: '', isRestricted: false,
    };
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      draft: 'status-draft', submitted: 'status-submitted', approved: 'status-approved',
      active: 'status-active', under_review: 'status-review', closed: 'status-closed', archived: 'status-archived',
    };
    return map[status] ?? '';
  }

  getSpentPercent(b: BudgetAllocation): number {
    if (!b.allocatedAmount) return 0;
    return Math.min((b.spentAmount / b.allocatedAmount) * 100, 100);
  }

  getBurnRateClass(pct: number): string {
    if (pct >= 90) return 'burn-critical';
    if (pct >= 75) return 'burn-warning';
    return 'burn-ok';
  }

  getCategoryIcon(cat: string): string {
    const icons: Record<string, string> = {
      operational: '⚙️', project: '📁', emergency: '🚨', strategic: '🎯',
      personnel: '👥', travel: '✈️', equipment: '🔧', indirect: '📊',
    };
    return icons[cat] ?? '💰';
  }
}