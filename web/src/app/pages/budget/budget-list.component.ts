import { CommonModule, DatePipe, DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { BudgetAllocation } from '../../core/models';

@Component({
  selector: 'app-budget-list',
  standalone: true,
  imports: [CommonModule, RouterLink, DatePipe, DecimalPipe, FormsModule],
  templateUrl: './budget-list.component.html',
  styleUrl: './budget.scss',
})
export class BudgetListComponent implements OnInit {
  budgets = signal<BudgetAllocation[]>([]);
  loading = signal(true);
  error = signal('');
  isFinance = signal(false);

  newBudgetForm = {
    name: '',
    allocatedAmount: 0,
    category: 'operational' as const,
    fiscalYear: new Date().getFullYear(),
    startDate: '',
    endDate: '',
    notes: '',
  };

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
  ) {
    this.isFinance.set(
      this.auth.user()?.role === 'admin' || this.auth.user()?.role === 'finance',
    );
  }

  ngOnInit() {
    this.loadBudgets();
  }

  loadBudgets() {
    this.loading.set(true);
    this.api.budgetAllocations().subscribe({
      next: (budgets) => {
        this.budgets.set(budgets);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load budgets');
        this.loading.set(false);
        console.error(err);
      },
    });
  }

  createBudget() {
    if (!this.newBudgetForm.name || this.newBudgetForm.allocatedAmount <= 0) {
      this.error.set('Please fill in all required fields');
      return;
    }

    this.api.createBudgetAllocation({
      ...this.newBudgetForm,
      status: 'draft',
    }).subscribe({
      next: () => {
        this.newBudgetForm = {
          name: '',
          allocatedAmount: 0,
          category: 'operational',
          fiscalYear: new Date().getFullYear(),
          startDate: '',
          endDate: '',
          notes: '',
        };
        this.loadBudgets();
      },
      error: () => {
        this.error.set('Failed to create budget');
      },
    });
  }

  getStatusClass(status: string): string {
    const statusClasses: Record<string, string> = {
      draft: 'status-draft',
      approved: 'status-approved',
      active: 'status-active',
      closed: 'status-closed',
    };
    return statusClasses[status] || '';
  }

  getSpentPercentage(budget: BudgetAllocation): number {
    return (budget.spentAmount / budget.allocatedAmount) * 100;
  }
}
