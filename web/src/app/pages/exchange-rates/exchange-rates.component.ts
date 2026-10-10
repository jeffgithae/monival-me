import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { formatHttpError } from '../../core/http-error';
import { ExchangeRates } from '../../core/models';
import { ToastService } from '../../core/toast.service';

interface OverrideRow {
  currency: string;
  rate: number | null;
}

@Component({
  selector: 'app-exchange-rates',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './exchange-rates.component.html',
  styleUrl: './exchange-rates.component.scss',
})
export class ExchangeRatesComponent implements OnInit {
  rates = signal<ExchangeRates | null>(null);
  loading = signal(true);
  saving = signal(false);
  refreshing = signal(false);
  error = signal('');
  search = signal('');
  readonly canEdit: boolean;

  /** The organisation's own rates being edited; saved as a whole. */
  rows: OverrideRow[] = [];
  private savedRows = '[]';

  /** Market rates, filtered by the search box, with any override alongside. */
  readonly marketRows = computed(() => {
    const r = this.rates();
    if (!r?.market) return [];
    const term = this.search().trim().toUpperCase();
    const overrides = r.overrides?.rates ?? {};
    return Object.entries(r.market.rates)
      .filter(([currency]) => currency !== r.baseCurrency && (!term || currency.includes(term)))
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rate]) => ({ currency, rate, override: overrides[currency] ?? null }));
  });

  constructor(
    private readonly api: ApiService,
    private readonly auth: AuthService,
    private readonly toast: ToastService,
  ) {
    this.canEdit = ['owner', 'admin', 'finance'].includes(this.auth.user()?.role ?? '');
  }

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.exchangeRates().subscribe({
      next: (rates) => {
        this.apply(rates);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not load exchange rates'));
        this.loading.set(false);
      },
    });
  }

  private apply(rates: ExchangeRates) {
    this.rates.set(rates);
    this.rows = Object.entries(rates.overrides?.rates ?? {})
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, rate]) => ({ currency, rate }));
    this.savedRows = JSON.stringify(this.rows);
  }

  get dirty(): boolean {
    return JSON.stringify(this.rows) !== this.savedRows;
  }

  marketRate(currency: string): number | null {
    return this.rates()?.market?.rates?.[currency.trim().toUpperCase()] ?? null;
  }

  /** Why a row cannot be saved, or '' when it can. */
  rowProblem(row: OverrideRow, index: number): string {
    const code = row.currency.trim().toUpperCase();
    if (!code && row.rate === null) return '';
    if (!/^[A-Z]{3}$/.test(code)) return 'Use a three-letter currency code, such as KES.';
    if (code === this.rates()?.baseCurrency) return 'This is the base currency; its rate is always 1.';
    if (this.rows.findIndex((r) => r.currency.trim().toUpperCase() === code) !== index) return `${code} is listed twice.`;
    if (!(Number(row.rate) > 0)) return 'Enter a rate greater than zero.';
    return '';
  }

  get canSave(): boolean {
    return this.dirty && this.rows.every((row, i) => !this.rowProblem(row, i));
  }

  addRow(currency = '') {
    const code = currency.toUpperCase();
    if (code && this.rows.some((r) => r.currency.trim().toUpperCase() === code)) return;
    this.rows = [...this.rows, { currency: code, rate: code ? this.marketRate(code) : null }];
  }

  removeRow(index: number) {
    this.rows = this.rows.filter((_, i) => i !== index);
  }

  discard() {
    this.rows = JSON.parse(this.savedRows);
  }

  save() {
    const base = this.rates()?.baseCurrency;
    if (!base || !this.canSave || this.saving()) return;
    const map: Record<string, number> = {};
    for (const row of this.rows) {
      const code = row.currency.trim().toUpperCase();
      if (code) map[code] = Number(row.rate);
    }
    this.saving.set(true);
    this.error.set('');
    this.api.setExchangeRateOverrides(base, map).subscribe({
      next: (rates) => {
        this.apply(rates);
        this.saving.set(false);
        this.toast.success(Object.keys(map).length ? 'Your rates are saved' : 'Your rates are removed; market rates apply');
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not save your rates'));
        this.saving.set(false);
      },
    });
  }

  refresh() {
    const base = this.rates()?.baseCurrency;
    if (!base || this.refreshing()) return;
    this.refreshing.set(true);
    this.error.set('');
    this.api.refreshExchangeRates(base).subscribe({
      next: (res) => {
        this.refreshing.set(false);
        if (res.refreshed) {
          this.toast.success('Market rates updated');
          this.load();
        } else {
          this.error.set('The rate provider could not be reached. The rates shown are the last ones fetched.');
        }
      },
      error: (err) => {
        this.error.set(formatHttpError(err, 'Could not refresh market rates'));
        this.refreshing.set(false);
      },
    });
  }
}
