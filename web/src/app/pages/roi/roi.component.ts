import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { IndicatorROI, Project, ROIReport } from '../../core/models';

type SortKey = 'costPerUnit' | 'progressPct' | 'totalCost' | 'code';

@Component({
  selector: 'app-roi',
  standalone: true,
  imports: [CommonModule, FormsModule, DecimalPipe, DatePipe],
  templateUrl: './roi.component.html',
  styleUrl: './roi.component.scss',
})
export class RoiComponent implements OnInit {
  private api = inject(ApiService);

  report     = signal<ROIReport | null>(null);
  projects   = signal<Project[]>([]);
  loading    = signal(true);
  error      = signal('');
  projectId  = signal('');
  sortKey    = signal<SortKey>('costPerUnit');
  efficiencyFilter = signal<'all' | 'high' | 'medium' | 'low' | 'no_data'>('all');

  readonly visibleIndicators = computed(() => {
    const r = this.report();
    if (!r) return [];
    const filter = this.efficiencyFilter();
    const list = filter === 'all' ? r.indicators : r.indicators.filter(i => i.efficiency === filter);

    const key = this.sortKey();
    return [...list].sort((a, b) => {
      if (key === 'code') return a.code.localeCompare(b.code);
      const av = a[key] ?? (key === 'progressPct' ? -1 : Infinity);
      const bv = b[key] ?? (key === 'progressPct' ? -1 : Infinity);
      return key === 'progressPct' ? bv - av : av - bv;
    });
  });

  ngOnInit() {
    this.api.projects().subscribe({
      next: ps => this.projects.set(ps),
      error: () => {},
    });
    this.load();
  }

  load() {
    this.loading.set(true);
    this.error.set('');
    this.api.roi(this.projectId() || undefined).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load the ROI report');
        this.loading.set(false);
      },
    });
  }

  setProject(id: string) {
    this.projectId.set(id);
    this.load();
  }

  setSort(key: SortKey) { this.sortKey.set(key); }
  setEfficiencyFilter(f: 'all' | 'high' | 'medium' | 'low' | 'no_data') { this.efficiencyFilter.set(f); }

  efficiencyLabel(e: IndicatorROI['efficiency']): string {
    const m: Record<IndicatorROI['efficiency'], string> = {
      high: 'High efficiency', medium: 'Medium efficiency', low: 'Low efficiency', no_data: 'No data',
    };
    return m[e];
  }

  /**
   * Per-indicator cost-efficiency sentence. Note: this endpoint computes cost
   * from activity.cost directly, not from grant burn rate — an indicator can
   * be linked to multiple grants or none, so we describe spend against THIS
   * indicator's own recorded activity cost, not a portfolio-wide grant
   * burn rate (which lives on the Insights page, where it's correctly
   * computed per-grant).
   */
  efficiencySentence(ind: IndicatorROI, currency: string): string | null {
    if (ind.progressPct === null || ind.costPerUnit === null) return null;
    return `${currency} ${ind.totalCost.toLocaleString()} spent on this indicator so far has achieved ${ind.progressPct}% of target — ${currency} ${ind.costPerUnit.toLocaleString()} per ${ind.unit}.`;
  }
}
