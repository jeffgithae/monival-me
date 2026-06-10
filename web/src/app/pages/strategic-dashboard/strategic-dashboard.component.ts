import { CommonModule, DecimalPipe, SlicePipe } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import {
  BalancedScorecard,
  BudgetSummary,
  FrameworkConfig,
  OKR,
} from '../../core/models';

@Component({
  selector: 'app-strategic-dashboard',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, SlicePipe],
  templateUrl: './strategic-dashboard.component.html',
  styleUrl: './strategic-dashboard.component.scss',
})
export class StrategicDashboardComponent implements OnInit {
  frameworkConfig = signal<FrameworkConfig | null>(null);
  budgetSummary = signal<BudgetSummary | null>(null);
  scorecards = signal<BalancedScorecard[]>([]);
  okrs = signal<OKR[]>([]);
  loading = signal(true);

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  constructor() {}

  ngOnInit() {
    this.loadDashboard();
  }

  loadDashboard() {
    this.loading.set(true);

    Promise.all([
      this.api.getFrameworkConfig().toPromise(),
      this.api.budgetSummary(this.auth.organization()?.id ?? '').toPromise(),
      this.api.balancedScorecards().toPromise(),
      this.api.okrs().toPromise(),
    ]).then(([config, budget, bscs, okrs_data]) => {
      this.frameworkConfig.set(config || null);
      this.budgetSummary.set(budget || null);
      this.scorecards.set(bscs || []);
      this.okrs.set(okrs_data || []);
      this.loading.set(false);
    });
  }

  getBudgetUtilization(): number {
    const summary = this.budgetSummary();
    if (!summary || summary.totalAllocated === 0) return 0;
    return (summary.totalSpent / summary.totalAllocated) * 100;
  }

  getAverageBSCScore(): number {
    const bscs = this.scorecards();
    if (bscs.length === 0) return 0;
    const totalScore = bscs.reduce((sum, bsc) => {
      const objectiveSum = bsc.perspectives.reduce(
        (pSum, p) => pSum + p.objectives.reduce((oSum, o) => oSum + (o.current / o.target) * 100, 0),
        0,
      );
      return sum + objectiveSum / bsc.perspectives.reduce((count, p) => count + p.objectives.length, 1);
    }, 0);
    return totalScore / bscs.length;
  }

  getAverageOKRProgress(): number {
    const okrs_data = this.okrs();
    if (okrs_data.length === 0) return 0;
    return okrs_data.reduce((sum, okr) => sum + okr.progressPercentage, 0) / okrs_data.length;
  }

  getUtilizationClass(percentage: number): string {
    if (percentage >= 80) return 'utilization-high';
    if (percentage >= 50) return 'utilization-medium';
    return 'utilization-low';
  }

  getScoreClass(score: number): string {
    if (score >= 80) return 'score-high';
    if (score >= 50) return 'score-medium';
    return 'score-low';
  }

  isFrameworkEnabled(framework: string): boolean {
    return this.frameworkConfig()?.availableFrameworks.includes(framework as any) || false;
  }
}