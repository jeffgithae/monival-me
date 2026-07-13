import { CommonModule, DecimalPipe, DatePipe } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { ApiService } from '../../core/api.service';

interface PeriodPoint {
  periodId: string; periodName: string; startDate: string; endDate: string;
  periodStatus: string; achieved: number; target: number; source?: string;
}
interface MonthPoint { month: string; value: number; }

interface IndicatorPerformance {
  indicator: any;
  achieved: number;
  pct: number;
  remaining: number;
  status: 'on_track' | 'at_risk' | 'behind';
  activityCount: number;
  trend: MonthPoint[];
  periodTrend: string;
  periodSeries: PeriodPoint[];
  disaggSummary: Record<string, Record<string, number>>;
  annualProgress: Array<{ year: number; target: number; achieved: number; pct: number }>;
  lastActivity: any;
}

/** Chart plot geometry (viewBox units). */
const W = 640, H = 240, PAD = { t: 16, r: 16, b: 28, l: 44 };

@Component({
  selector: 'app-indicator-detail',
  standalone: true,
  imports: [CommonModule, RouterLink, DecimalPipe, DatePipe],
  templateUrl: './indicator-detail.component.html',
  styleUrl: './indicator-detail.component.scss',
})
export class IndicatorDetailComponent implements OnInit {
  private api = inject(ApiService);
  private route = inject(ActivatedRoute);

  perf = signal<IndicatorPerformance | null>(null);
  loading = signal(true);
  error = signal('');

  /** Crosshair state for the period line chart. */
  hoverIdx = signal<number | null>(null);
  /** Hover state for the monthly column chart. */
  hoverBar = signal<number | null>(null);

  readonly W = W;
  readonly H = H;
  readonly PAD = PAD;

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') || '';
    this.api.indicatorPerformance(id).subscribe({
      next: (p) => { this.perf.set(p); this.loading.set(false); },
      error: (err) => {
        this.error.set(err?.error?.message || 'Failed to load indicator');
        this.loading.set(false);
      },
    });
  }

  // ── Period line chart (achieved = emphasis hue, target = context gray) ────

  readonly periodMax = computed(() => {
    const s = this.perf()?.periodSeries ?? [];
    return Math.max(1, ...s.map((p) => Math.max(p.achieved, p.target)));
  });

  px(i: number): number {
    const n = (this.perf()?.periodSeries ?? []).length;
    if (n <= 1) return PAD.l + (W - PAD.l - PAD.r) / 2;
    return PAD.l + (i * (W - PAD.l - PAD.r)) / (n - 1);
  }

  py(v: number): number {
    return H - PAD.b - (v / this.periodMax()) * (H - PAD.t - PAD.b);
  }

  polyline(key: 'achieved' | 'target'): string {
    return (this.perf()?.periodSeries ?? [])
      .map((p, i) => `${this.px(i)},${this.py(p[key])}`)
      .join(' ');
  }

  readonly yTicks = computed(() => {
    const max = this.periodMax();
    return [0, 0.25, 0.5, 0.75, 1].map((f) => ({ v: Math.round(max * f), y: this.py(max * f) }));
  });

  onLineMove(evt: MouseEvent) {
    const series = this.perf()?.periodSeries ?? [];
    if (!series.length) return;
    const svg = evt.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const x = ((evt.clientX - rect.left) / rect.width) * W;
    let best = 0, bestD = Infinity;
    series.forEach((_, i) => {
      const d = Math.abs(this.px(i) - x);
      if (d < bestD) { bestD = d; best = i; }
    });
    this.hoverIdx.set(best);
  }

  /** Tooltip x as a % of the chart width so the HTML layer tracks the SVG. */
  tipLeftPct(i: number): number { return (this.px(i) / W) * 100; }

  /**
   * Direct-label y positions with collision avoidance: when achieved and
   * target sit within 14px at the last point, push them apart vertically.
   */
  readonly labelYs = computed(() => {
    const series = this.perf()?.periodSeries ?? [];
    if (!series.length) return { achieved: 0, target: 0 };
    const last = series[series.length - 1];
    let a = this.py(last.achieved) + 4;
    let t = this.py(last.target) + 4;
    if (Math.abs(a - t) < 14) {
      if (a <= t) { a -= 7; t += 9; } else { t -= 7; a += 9; }
    }
    return { achieved: a, target: t };
  });

  // ── Monthly column chart ───────────────────────────────────────────────────

  readonly monthMax = computed(() =>
    Math.max(1, ...(this.perf()?.trend ?? []).map((t) => t.value)));

  /** Bar geometry: capped thickness, centered in its band. */
  barGeom(i: number): { x: number; y: number; w: number; h: number } {
    const trend = this.perf()?.trend ?? [];
    const n = Math.max(1, trend.length);
    const band = (W - PAD.l - PAD.r) / n;
    const w = Math.min(24, Math.max(6, band - 8));
    const x = PAD.l + i * band + (band - w) / 2;
    const h = (trend[i].value / this.monthMax()) * (H - PAD.t - PAD.b);
    return { x, y: H - PAD.b - h, w, h };
  }

  /** Column with a 4px rounded data-end and a square baseline. */
  barPath(i: number): string {
    const { x, y, w, h } = this.barGeom(i);
    const r = Math.min(4, h, w / 2);
    const base = H - PAD.b;
    return `M ${x},${base} L ${x},${y + r} Q ${x},${y} ${x + r},${y}` +
      ` L ${x + w - r},${y} Q ${x + w},${y} ${x + w},${y + r} L ${x + w},${base} Z`;
  }

  /** Selective direct labels: only the max and the latest month. */
  showBarLabel(i: number): boolean {
    const trend = this.perf()?.trend ?? [];
    if (!trend.length) return false;
    const maxIdx = trend.reduce((m, t, idx) => (t.value > trend[m].value ? idx : m), 0);
    return i === maxIdx || i === trend.length - 1;
  }

  monthLabel(m: string): string {
    const [y, mo] = m.split('-');
    return new Date(Number(y), Number(mo) - 1, 1)
      .toLocaleDateString(undefined, { month: 'short', year: '2-digit' });
  }

  /** Thin every nth month label when the series is long. */
  showMonthTick(i: number): boolean {
    const n = (this.perf()?.trend ?? []).length;
    const step = n > 16 ? 4 : n > 8 ? 2 : 1;
    return i % step === 0;
  }

  // ── Disaggregation bars ────────────────────────────────────────────────────

  readonly disaggGroups = computed(() => {
    const d = this.perf()?.disaggSummary ?? {};
    return Object.entries(d).map(([category, values]) => {
      const rows = Object.entries(values).map(([label, count]) => ({ label, count }));
      const max = Math.max(1, ...rows.map((r) => r.count));
      return { category, rows, max };
    });
  });

  statusLabel(s: string): string {
    return s === 'on_track' ? 'On track' : s === 'at_risk' ? 'At risk' : 'Behind';
  }
}
