import { CommonModule, DatePipe, DecimalPipe, TitleCasePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BudgetAllocation, BudgetLineItem, BudgetVariance } from '../../core/models';

type Tab = 'details' | 'line-items' | 'variance' | 'audit';

@Component({
  selector: 'app-budget-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, TitleCasePipe, FormsModule],
  templateUrl: './budget-detail.component.html',
  styleUrl: './budget.scss',
})
export class BudgetDetailComponent implements OnInit {
  budget = signal<BudgetAllocation | null>(null);
  lineItems = signal<BudgetLineItem[]>([]);
  variance = signal<BudgetVariance[]>([]);
  auditLog = signal<unknown[]>([]);
  tab = signal<Tab>('details');
  budgetId = '';
  loading = signal(true);
  lineItemsLoading = signal(false);
  varianceLoading = signal(false);
  error = signal('');
  lineItemError = signal('');
  isFinance = signal(false);
  showLineItemForm = signal(false);
  showReviseForm = signal(false);
  showVarianceCalc = signal(false);

  // Revision form
  reviseForm = {
    newAllocatedAmount: 0,
    reason: 'reallocation',
    notes: '',
  };

  // Variance calculation form
  varianceCalcForm = {
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    notes: '',
  };

  // Line item creation form — mirrors CreateLineItemDto exactly
  lineItemForm = {
    description: '',
    costCategory: '',
    unitDescription: 'unit',
    quantity: 1,
    unitCost: 0,
    notes: '',
    invoiceReference: '',
    paymentDate: '',
    donorCostCategory: '',
  };

  readonly revisionReasons = [
    { value: 'reallocation',     label: 'Reallocation' },
    { value: 'scope_change',     label: 'Scope Change' },
    { value: 'donor_amendment',  label: 'Donor Amendment' },
    { value: 'cost_savings',     label: 'Cost Savings' },
    { value: 'emergency',        label: 'Emergency' },
    { value: 'other',            label: 'Other' },
  ];

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    const role = this.auth.user()?.role;
    this.isFinance.set(role === 'admin' || role === 'owner' || role === 'finance');
  }

  ngOnInit() {
    this.budgetId = this.route.snapshot.paramMap.get('id') || '';
    this.loadAll();
  }

  loadAll() {
    this.loading.set(true);
    this.api.budgetAllocation(this.budgetId).subscribe({
      next: (budget) => {
        this.budget.set(budget);
        this.loading.set(false);
        this.loadLineItems();
        this.loadVariance();
      },
      error: () => {
        this.error.set('Failed to load budget.');
        this.loading.set(false);
      },
    });
  }

  loadLineItems() {
    this.lineItemsLoading.set(true);
    this.api.budgetLineItems(this.budgetId).subscribe({
      next: (items) => {
        this.lineItems.set(items);
        this.lineItemsLoading.set(false);
      },
      error: () => this.lineItemsLoading.set(false),
    });
  }

  loadVariance() {
    this.varianceLoading.set(true);
    this.api.budgetVariance(this.budgetId).subscribe({
      next: (data) => {
        this.variance.set(data);
        this.varianceLoading.set(false);
      },
      error: () => this.varianceLoading.set(false),
    });
  }

  loadAuditLog() {
    this.api.budgetAuditLog(this.budgetId).subscribe({
      next: (log) => this.auditLog.set(log),
    });
  }

  setTab(t: Tab) {
    this.tab.set(t);
    if (t === 'audit' && this.auditLog().length === 0) this.loadAuditLog();
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  addLineItem() {
    const f = this.lineItemForm;
    if (!f.description || !f.costCategory || !f.unitDescription || f.quantity <= 0 || f.unitCost <= 0) {
      this.lineItemError.set('Description, cost category, unit, quantity (> 0) and unit cost (> 0) are required.');
      return;
    }
    this.lineItemError.set('');
    this.api.createBudgetLineItem({
      budgetAllocationId: this.budgetId,
      description: f.description,
      costCategory: f.costCategory,
      unitDescription: f.unitDescription,
      quantity: f.quantity,
      unitCost: f.unitCost,
      notes: f.notes || undefined,
      invoiceReference: f.invoiceReference || undefined,
      paymentDate: f.paymentDate || undefined,
      donorCostCategory: f.donorCostCategory || undefined,
    }).subscribe({
      next: () => {
        this.resetLineItemForm();
        this.showLineItemForm.set(false);
        this.loadLineItems();
        this.loadAll(); // refresh totals
      },
      error: () => this.lineItemError.set('Failed to add line item.'),
    });
  }

  resetLineItemForm() {
    this.lineItemForm = {
      description: '',
      costCategory: '',
      unitDescription: 'unit',
      quantity: 1,
      unitCost: 0,
      notes: '',
      invoiceReference: '',
      paymentDate: '',
      donorCostCategory: '',
    };
  }

  updateLineItemStatus(item: BudgetLineItem, status: string) {
    this.api.updateBudgetLineItem(item._id, { status }).subscribe({
      next: () => this.loadLineItems(),
    });
  }

  updateLineItemSpent(item: BudgetLineItem, spent: number) {
    this.api.updateBudgetLineItem(item._id, { spent }).subscribe({
      next: () => {
        this.loadLineItems();
        this.loadAll();
      },
    });
  }

  deleteLineItem(id: string) {
    if (!confirm('Delete this line item? The committed amount will be returned to the budget.')) return;
    this.api.deleteBudgetLineItem(id).subscribe({
      next: () => {
        this.loadLineItems();
        this.loadAll();
      },
    });
  }

  approveBudget() {
    this.api.approveBudget(this.budgetId).subscribe({
      next: () => this.loadAll(),
    });
  }

  closeBudget() {
    if (!confirm('Close this budget allocation? This cannot be undone.')) return;
    this.api.closeBudget(this.budgetId).subscribe({
      next: () => this.loadAll(),
    });
  }

  reviseBudget() {
    const f = this.reviseForm;
    if (!f.newAllocatedAmount || f.newAllocatedAmount <= 0 || !f.reason) return;
    this.api.reviseBudget(this.budgetId, {
      newAllocatedAmount: f.newAllocatedAmount,
      reason: f.reason,
      notes: f.notes || undefined,
    }).subscribe({
      next: () => {
        this.showReviseForm.set(false);
        this.reviseForm = { newAllocatedAmount: 0, reason: 'reallocation', notes: '' };
        this.loadAll();
      },
      error: () => this.error.set('Failed to revise budget.'),
    });
  }

  calculateVariance() {
    const f = this.varianceCalcForm;
    if (!f.period) return;
    this.api.calculateVariance(this.budgetId, f.period, f.notes || undefined).subscribe({
      next: () => {
        this.showVarianceCalc.set(false);
        this.loadVariance();
      },
      error: () => this.error.set('Failed to calculate variance.'),
    });
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  getSpentPercent(b: BudgetAllocation): number {
    if (!b.allocatedAmount) return 0;
    return Math.min((b.spentAmount / b.allocatedAmount) * 100, 100);
  }

  getProgressColor(pct: number): string {
    if (pct >= 90) return '#ef4444';
    if (pct >= 75) return '#f59e0b';
    return '#3b82f6';
  }

  getBurnClass(pct: number): string {
    if (pct >= 90) return 'burn-critical';
    if (pct >= 75) return 'burn-warning';
    return 'burn-ok';
  }

  lineItemTotal(item: BudgetLineItem): number {
    return item.quantity * item.unitCost;
  }

  varianceTrendIcon(trend: string): string {
    if (trend === 'favorable') return '📉';
    if (trend === 'unfavorable') return '📈';
    return '➡️';
  }

  varianceTrendClass(trend: string): string {
    if (trend === 'favorable') return 'favorable';
    if (trend === 'unfavorable') return 'unfavorable';
    return '';
  }

  alertLevelClass(level: string): string {
    if (level === 'critical') return 'alert-critical';
    if (level === 'warning') return 'alert-warning';
    return '';
  }

  get canApprove(): boolean {
    const b = this.budget();
    return !!b && (b.status === 'draft' || b.status === 'submitted') && this.isFinance();
  }

  get canRevise(): boolean {
    const b = this.budget();
    return !!b && (b.status === 'approved' || b.status === 'active') && this.isFinance();
  }

  getStatusClass(status: string): string {
    const map: Record<string, string> = {
      draft:        'status-draft',
      submitted:    'status-submitted',
      approved:     'status-approved',
      active:       'status-active',
      under_review: 'status-review',
      closed:       'status-closed',
      archived:     'status-archived',
    };
    return map[status] ?? '';
  }

  get canClose(): boolean {
    const b = this.budget();
    return !!b && b.status === 'active' && this.isFinance();
  }
}