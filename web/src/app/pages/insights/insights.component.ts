import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { CommonModule, DatePipe, KeyValuePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { Insight, InsightSeverity, InsightsReport, Project } from '../../core/models';

@Component({
  selector: 'app-insights',
  standalone: true,
  imports: [CommonModule, FormsModule, DatePipe, KeyValuePipe],
  templateUrl: './insights.component.html',
  styleUrl: './insights.component.scss',
})
export class InsightsComponent implements OnInit {
  private api = inject(ApiService);

  report      = signal<InsightsReport | null>(null);
  projects    = signal<Project[]>([]);
  loading     = signal(true);
  error       = signal('');
  projectId   = signal('');
  activeTab   = signal<InsightSeverity | 'all'>('all');

  readonly tabs: Array<{ id: InsightSeverity | 'all'; label: string }> = [
    { id: 'all',         label: 'All' },
    { id: 'critical',    label: 'Critical' },
    { id: 'warning',     label: 'Warning' },
    { id: 'opportunity', label: 'Opportunity' },
    { id: 'info',        label: 'Info' },
  ];

  readonly filteredInsights = computed(() => {
    const r = this.report();
    if (!r) return [];
    const tab = this.activeTab();
    return tab === 'all' ? r.insights : r.insights.filter(i => i.type === tab);
  });

  readonly tabCount = computed(() => {
    const r = this.report();
    return (tab: InsightSeverity | 'all'): number => {
      if (!r) return 0;
      if (tab === 'all') return r.totalInsights;
      return r[tab];
    };
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
    this.api.insights(this.projectId() || undefined).subscribe({
      next: r => { this.report.set(r); this.loading.set(false); },
      error: err => {
        this.error.set(err.error?.message || 'Failed to load insights');
        this.loading.set(false);
      },
    });
  }

  setProject(id: string) {
    this.projectId.set(id);
    this.load();
  }

  setTab(tab: InsightSeverity | 'all') {
    this.activeTab.set(tab);
  }

  severityIcon(type: InsightSeverity): string {
    const m: Record<InsightSeverity, string> = {
      critical: '🔴', warning: '🟡', opportunity: '🟢', info: '🔵',
    };
    return m[type];
  }

  categoryLabel(category: string): string {
    const m: Record<string, string> = {
      financial_programmatic: 'Financial × Programmatic',
      grant_expiry:           'Grant Expiry',
      indicator_health:       'Indicator Health',
      approvals_backlog:      'Approvals',
      data_quality:           'Data Quality',
      reporting_compliance:   'Reporting Compliance',
    };
    return m[category] ?? category;
  }

  entityRoute(insight: Insight): string[] | null {
    if (!insight.entityId || !insight.entityType) return null;
    const map: Record<string, string> = {
      Grant: '/grants',
      Indicator: '/reporting',
      ReportingPeriod: '/reporting',
    };
    const base = map[insight.entityType];
    return base ? [base] : null;
  }
}
