import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BudgetAllocation, BudgetLineItem, BudgetVariance } from '../../core/models';

type Tab = 'details' | 'line-items' | 'variance';

@Component({
  selector: 'app-budget-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './budget-detail.component.html',
  styleUrl: './budget.scss',
})
export class BudgetDetailComponent implements OnInit {
  budget = signal<BudgetAllocation | null>(null);
  lineItems = signal<BudgetLineItem[]>([]);
  variance = signal<BudgetVariance[]>([]);
  tab = signal<Tab>('details');
  budgetId = '';
  loading = signal(true);
  isFinance = signal(false);

  lineItemForm = {
    title: '',
    description: '',
    plannedAmount: 0,
    category: '',
  };

  constructor(
    private readonly route: ActivatedRoute,
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isFinance.set(
      this.auth.user()?.role === 'admin' || this.auth.user()?.role === 'finance',
    );
  }

  ngOnInit() {
    this.budgetId = this.route.snapshot.paramMap.get('id') || '';
    this.loadBudgetDetails();
  }

  loadBudgetDetails() {
    this.loading.set(true);
    this.api.budgetAllocation(this.budgetId).subscribe({
      next: (budget) => {
        this.budget.set(budget);
        this.loadLineItems();
        this.loadVariance();
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  loadLineItems() {
    this.api.budgetLineItems(this.budgetId).subscribe({
      next: (items) => {
        this.lineItems.set(items);
      },
    });
  }

  loadVariance() {
    this.api.budgetVariance(this.budgetId).subscribe({
      next: (data) => {
        this.variance.set(data);
        this.loading.set(false);
      },
    });
  }

  setTab(t: Tab) {
    this.tab.set(t);
  }

  addLineItem() {
    if (!this.lineItemForm.title || this.lineItemForm.plannedAmount <= 0) {
      return;
    }

    this.api.createBudgetLineItem({
      ...this.lineItemForm,
      budgetId: this.budgetId,
      status: 'planned',
    }).subscribe({
      next: () => {
        this.lineItemForm = {
          title: '',
          description: '',
          plannedAmount: 0,
          category: '',
        };
        this.loadLineItems();
      },
    });
  }

  approveBudget() {
    this.api.approveBudget(this.budgetId).subscribe({
      next: () => {
        this.loadBudgetDetails();
      },
    });
  }

  updateLineItem(id: string, status: string) {
    this.api.updateBudgetLineItem(id, { status: status as any }).subscribe({
      next: () => {
        this.loadLineItems();
      },
    });
  }

  getVarianceIcon(trend: string): string {
    return trend === 'favorable' ? '📉' : '📈';
  }

  getVarianceColor(trend: string): string {
    return trend === 'favorable' ? 'favorable' : 'unfavorable';
  }
}
