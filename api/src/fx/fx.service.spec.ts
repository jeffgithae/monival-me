import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ConfigService } from '@nestjs/config';
import { FxService } from './fx.service';
import { ExchangeRate } from './schemas/exchange-rate.schema';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  return p;
}

describe('FxService', () => {
  let service: FxService;
  let rateModel: any;
  let fetchMock: jest.Mock;

  beforeEach(async () => {
    rateModel = {
      findOne: jest.fn().mockReturnValue(q(null)),
      find: jest.fn().mockReturnValue(q([])),
      updateOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      deleteOne: jest.fn().mockResolvedValue({ acknowledged: true }),
      collection: { dropIndex: jest.fn().mockResolvedValue(undefined) },
    };
    fetchMock = jest.fn();
    (global as any).fetch = fetchMock;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FxService,
        { provide: getModelToken(ExchangeRate.name), useValue: rateModel },
        { provide: ConfigService, useValue: { get: () => undefined } },
      ],
    }).compile();

    service = module.get(FxService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('conversion', () => {
    it('treats same-currency conversion as identity without touching the cache', async () => {
      const res = await service.convert(1000, 'USD', 'USD');

      expect(res).toEqual({ amount: 1000, rate: 1, source: 'identity' });
      expect(rateModel.findOne).not.toHaveBeenCalled();
    });

    it('prefers an explicit rate captured on the record over the live cache', async () => {
      rateModel.findOne.mockReturnValue(q({ baseCurrency: 'KES', rates: { USD: 0.01 }, fetchedAt: new Date() }));

      const res = await service.convert(100_000, 'KES', 'USD', 0.0077);

      // 0.0077 is the rate the award was booked at — not today's 0.01.
      expect(res.amount).toBeCloseTo(770);
      expect(res.source).toBe('explicit');
    });

    it('falls back to the cached direct quote', async () => {
      rateModel.findOne.mockReturnValue(
        q({ baseCurrency: 'KES', rates: { USD: 0.008 }, fetchedAt: new Date('2026-08-01') }),
      );

      const res = await service.convert(1000, 'KES', 'USD');

      expect(res.amount).toBeCloseTo(8);
      expect(res.source).toBe('cache');
      expect(res.rateDate).toEqual(new Date('2026-08-01'));
    });

    it('derives an inverse quote when only the reverse pair is cached', async () => {
      rateModel.findOne.mockImplementation((f: any) =>
        f.baseCurrency === 'USD'
          ? q({ baseCurrency: 'USD', rates: { KES: 125 }, fetchedAt: new Date() })
          : q(null),
      );

      const res = await service.convert(1000, 'KES', 'USD');

      expect(res.amount).toBeCloseTo(8);
      expect(res.source).toBe('cache');
    });

    it('reports unavailable rather than silently assuming 1:1', async () => {
      rateModel.findOne.mockReturnValue(q(null));

      const res = await service.convert(1000, 'XOF', 'USD');

      // The original bug was adding foreign amounts at face value.
      expect(res).toEqual({ amount: 0, rate: 0, source: 'unavailable' });
    });

    it('ignores a zero or negative explicit rate', async () => {
      rateModel.findOne.mockReturnValue(q(null));

      const res = await service.convert(1000, 'KES', 'USD', 0);

      expect(res.source).toBe('unavailable');
    });
  });

  describe('provider refresh', () => {
    it('caches rates returned by the provider', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ rates: { KES: 129.4 } }) });

      const ok = await service.refresh('USD');

      expect(ok).toBe(true);
      const [filter, update] = rateModel.updateOne.mock.calls[0];
      expect(filter).toEqual({ baseCurrency: 'USD', organizationId: null });
      expect(update.rates).toEqual({ KES: 129.4 });
      expect(update.source).toBe('provider');
    });

    it('accepts the alternative conversion_rates payload shape', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ conversion_rates: { EUR: 0.92 } }) });

      expect(await service.refresh('USD')).toBe(true);
      expect(rateModel.updateOne.mock.calls[0][1].rates).toEqual({ EUR: 0.92 });
    });

    it('keeps the previous cache when the provider is unreachable', async () => {
      fetchMock.mockRejectedValue(new Error('ENOTFOUND'));

      const ok = await service.refresh('USD');

      expect(ok).toBe(false);
      expect(rateModel.updateOne).not.toHaveBeenCalled();
    });

    it('keeps the previous cache on a non-2xx response', async () => {
      fetchMock.mockResolvedValue({ ok: false, status: 503 });

      expect(await service.refresh('USD')).toBe(false);
      expect(rateModel.updateOne).not.toHaveBeenCalled();
    });

    it('rejects a payload with no rates rather than caching junk', async () => {
      fetchMock.mockResolvedValue({ ok: true, json: async () => ({ result: 'error' }) });

      expect(await service.refresh('USD')).toBe(false);
      expect(rateModel.updateOne).not.toHaveBeenCalled();
    });

    it('never lets a provider outage escape to the caller', async () => {
      fetchMock.mockRejectedValue(new Error('network down'));

      await expect(service.refreshAll()).resolves.not.toThrow();
    });
  });

  describe('organisation overrides', () => {
    const ORG = '6a802d8b1948b75ea09fa6b8';
    const OTHER = '6a802d8d1948b75ea09fa746';

    it('stores an organisation\'s rates against that organisation only', async () => {
      await service.setManualRates(ORG, 'usd', { kes: 130 });

      const [filter, update] = rateModel.updateOne.mock.calls[0];
      expect(filter.baseCurrency).toBe('USD');
      expect(filter.organizationId.toString()).toBe(ORG);
      expect(update.source).toBe('manual');
      expect(update.rates).toEqual({ KES: 130 });
    });

    it('rejects rates that are not positive numbers or not currency codes', async () => {
      await expect(service.setManualRates(ORG, 'USD', { KES: 0 })).rejects.toThrow();
      await expect(service.setManualRates(ORG, 'USD', { KES: 'lots' as unknown as number })).rejects.toThrow();
      await expect(service.setManualRates(ORG, 'USD', { SHILLINGS: 130 })).rejects.toThrow();
      expect(rateModel.updateOne).not.toHaveBeenCalled();
    });

    it('uses the organisation\'s rate for that organisation and the market rate for everyone else', async () => {
      rateModel.findOne.mockImplementation((filter: any) =>
        q(
          filter.organizationId?.toString() === ORG
            ? { baseCurrency: 'USD', rates: { KES: 130 }, fetchedAt: new Date() }
            : filter.organizationId
              ? null
              : { baseCurrency: 'USD', rates: { KES: 129.4 }, fetchedAt: new Date() },
        ),
      );

      expect((await service.convert(100, 'USD', 'KES', null, ORG)).amount).toBeCloseTo(13_000);
      expect((await service.convert(100, 'USD', 'KES', null, OTHER)).amount).toBeCloseTo(12_940);
      expect((await service.convert(100, 'USD', 'KES')).amount).toBeCloseTo(12_940);
    });
  });
});
