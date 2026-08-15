import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import { ExchangeRate } from './schemas/exchange-rate.schema';

/**
 * Keyless by default — open.er-api.com serves daily rates with no API key and
 * no signup, which keeps financial reporting free of a credential that could
 * silently expire. Override with FX_RATES_URL to point at a paid provider;
 * `{base}` is substituted with the base currency.
 */
const DEFAULT_PROVIDER_URL = 'https://open.er-api.com/v6/latest/{base}';
const PROVIDER_TIMEOUT_MS = 8_000;

export interface ConversionResult {
  amount: number;
  rate: number;
  /** Where the rate came from — surfaced so a report can disclose staleness. */
  source: 'identity' | 'explicit' | 'cache' | 'unavailable';
  rateDate?: Date;
}

@Injectable()
export class FxService implements OnModuleInit {
  private readonly logger = new Logger(FxService.name);
  private readonly providerUrl: string;
  /** In-process memo so a portfolio roll-up doesn't re-query Mongo per grant. */
  private memo = new Map<string, { rates: Record<string, number>; fetchedAt: Date }>();

  constructor(
    @InjectModel(ExchangeRate.name) private readonly rateModel: Model<ExchangeRate>,
    private readonly config: ConfigService,
  ) {
    this.providerUrl =
      (this.config.get<string>('FX_RATES_URL') ?? '').trim() || DEFAULT_PROVIDER_URL;
  }

  async onModuleInit() {
    // Warm the cache without blocking boot; a cold cache degrades to
    // `unavailable` rather than throwing.
    this.refreshAll().catch((e) =>
      this.logger.warn(`Initial FX refresh failed: ${e?.message ?? e}`),
    );
  }

  /** Refresh every base currency we already hold, daily. */
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async refreshAll() {
    const existing = await this.rateModel.find({ source: 'provider' }).select('baseCurrency').lean();
    const bases = new Set(existing.map((r) => r.baseCurrency));
    if (bases.size === 0) bases.add('USD');
    for (const base of bases) {
      await this.refresh(base).catch((e) =>
        this.logger.warn(`FX refresh failed for ${base}: ${e?.message ?? e}`),
      );
    }
  }

  /**
   * Fetch and cache rates for one base currency. Never throws on a provider
   * failure — the previous cache entry stays in place and remains usable.
   */
  async refresh(baseCurrency: string): Promise<boolean> {
    const base = baseCurrency.toUpperCase();
    const url = this.providerUrl.replace('{base}', base);

    let payload: any;
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), PROVIDER_TIMEOUT_MS);
      try {
        const res = await fetch(url, { signal: ctl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        payload = await res.json();
      } finally {
        clearTimeout(timer);
      }
    } catch (e: any) {
      this.logger.warn(`FX provider unreachable for ${base}: ${e?.message ?? e}`);
      return false;
    }

    const rates = payload?.rates ?? payload?.conversion_rates;
    if (!rates || typeof rates !== 'object') {
      this.logger.warn(`FX provider returned no rates for ${base}`);
      return false;
    }

    await this.rateModel.updateOne(
      { baseCurrency: base },
      {
        baseCurrency: base,
        rates,
        fetchedAt: new Date(),
        source: 'provider',
        providerName: new URL(url).host,
      },
      { upsert: true },
    );
    this.memo.delete(base);
    this.logger.log(`FX rates refreshed for ${base} (${Object.keys(rates).length} pairs)`);
    return true;
  }

  /** Operator override — wins over provider data for that base currency. */
  async setManualRates(baseCurrency: string, rates: Record<string, number>) {
    const base = baseCurrency.toUpperCase();
    await this.rateModel.updateOne(
      { baseCurrency: base },
      { baseCurrency: base, rates, fetchedAt: new Date(), source: 'manual' },
      { upsert: true },
    );
    this.memo.delete(base);
    return this.rateModel.findOne({ baseCurrency: base }).lean();
  }

  /**
   * Rate to convert 1 unit of `from` into `to`.
   *
   * Resolution order: identity → cached direct quote → cached inverse quote.
   * Returns null when no rate is known, so callers can report the amount as
   * unconvertible rather than silently treating it as 1:1.
   */
  async getRate(from: string, to: string): Promise<{ rate: number | null; fetchedAt?: Date }> {
    const f = (from || '').toUpperCase();
    const t = (to || '').toUpperCase();
    if (!f || !t || f === t) return { rate: 1 };

    const direct = await this.load(f);
    if (direct?.rates?.[t]) return { rate: direct.rates[t], fetchedAt: direct.fetchedAt };

    // A USD-based cache can still price EUR→USD as 1/rate(USD→EUR).
    const inverse = await this.load(t);
    if (inverse?.rates?.[f]) {
      const r = inverse.rates[f];
      if (r > 0) return { rate: 1 / r, fetchedAt: inverse.fetchedAt };
    }

    return { rate: null };
  }

  /**
   * Convert an amount, preferring an explicit rate captured on the record so
   * historical awards aren't restated as the market moves.
   */
  async convert(
    amount: number,
    from: string,
    to: string,
    explicitRate?: number | null,
  ): Promise<ConversionResult> {
    const f = (from || '').toUpperCase();
    const t = (to || '').toUpperCase();

    if (!f || !t || f === t) return { amount, rate: 1, source: 'identity' };
    if (explicitRate && explicitRate > 0) {
      return { amount: amount * explicitRate, rate: explicitRate, source: 'explicit' };
    }

    const { rate, fetchedAt } = await this.getRate(f, t);
    if (rate === null) return { amount: 0, rate: 0, source: 'unavailable' };
    return { amount: amount * rate, rate, source: 'cache', rateDate: fetchedAt };
  }

  private async load(base: string) {
    const memo = this.memo.get(base);
    if (memo) return memo;
    const doc = await this.rateModel.findOne({ baseCurrency: base }).lean();
    if (!doc) return null;
    const entry = { rates: doc.rates, fetchedAt: doc.fetchedAt };
    this.memo.set(base, entry);
    return entry;
  }
}
