import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { ForbiddenException, Logger } from '@nestjs/common';
import { Types } from 'mongoose';
import { AiUsageService } from './ai-usage.service';
import { AiUsage } from './schemas/ai-usage.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { PLANS } from '../common/constants/plans';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();

describe('AiUsageService', () => {
  let service: AiUsageService;
  let usageModel: any;
  let orgModel: any;

  beforeEach(async () => {
    usageModel = {
      findOne: jest.fn().mockReturnValue(q(null)),
      updateOne: jest.fn().mockResolvedValue({ upsertedCount: 1 }),
    };
    orgModel = {
      findById: jest.fn().mockReturnValue(q({ planId: 'starter' })),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AiUsageService,
        { provide: getModelToken(AiUsage.name), useValue: usageModel },
        { provide: getModelToken(Organization.name), useValue: orgModel },
      ],
    }).compile();

    service = module.get(AiUsageService);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('assertWithinBudget', () => {
    it('allows a request when the org is under its plan allowance', async () => {
      usageModel.findOne.mockReturnValue(
        q({ inputTokens: 1_000, outputTokens: 500 }),
      );

      await expect(service.assertWithinBudget(ORG_ID)).resolves.toBeUndefined();
    });

    it('blocks once input + output tokens reach the plan ceiling', async () => {
      const limit = PLANS.starter.maxAiTokensPerMonth!;
      usageModel.findOne.mockReturnValue(
        q({ inputTokens: limit - 10, outputTokens: 10 }),
      );

      // This is the cost control: without it, one authenticated user on the
      // cheapest plan can drive unbounded model spend.
      await expect(service.assertWithinBudget(ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('never blocks a plan with no ceiling', async () => {
      orgModel.findById.mockReturnValue(q({ planId: 'enterprise' }));
      usageModel.findOne.mockReturnValue(
        q({ inputTokens: 10 ** 9, outputTokens: 10 ** 9 }),
      );

      await expect(service.assertWithinBudget(ORG_ID)).resolves.toBeUndefined();
    });

    it('treats an unknown plan as the trial allowance rather than unlimited', async () => {
      orgModel.findById.mockReturnValue(q({ planId: 'not-a-real-plan' }));
      usageModel.findOne.mockReturnValue(
        q({ inputTokens: PLANS.trial.maxAiTokensPerMonth!, outputTokens: 0 }),
      );

      await expect(service.assertWithinBudget(ORG_ID)).rejects.toThrow(
        ForbiddenException,
      );
    });
  });

  describe('record', () => {
    it('increments the org/period counters and the per-feature breakdown', async () => {
      await service.record(ORG_ID, 'copilot.message', {
        inputTokens: 120,
        outputTokens: 45,
      });

      const [filter, update, options] = usageModel.updateOne.mock.calls[0];
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
      expect(filter.period).toBe(AiUsageService.periodFor());
      expect(update.$inc).toEqual({
        inputTokens: 120,
        outputTokens: 45,
        requests: 1,
        'requestsByFeature.copilot.message': 1,
      });
      expect(options).toEqual({ upsert: true });
    });

    it('swallows write failures so accounting never fails a served request', async () => {
      // The failure is the point of the test, so keep its log line out of the
      // suite output rather than making a passing run look broken.
      jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
      usageModel.updateOne.mockRejectedValue(new Error('mongo down'));

      await expect(
        service.record(ORG_ID, 'copilot.message', {
          inputTokens: 1,
          outputTokens: 1,
        }),
      ).resolves.toBeUndefined();
    });
  });

  describe('periodFor', () => {
    it('keys on the UTC calendar month', () => {
      expect(AiUsageService.periodFor(new Date('2026-03-09T23:30:00Z'))).toBe(
        '2026-03',
      );
      // Late-UTC-month local dates must not roll into the next period.
      expect(AiUsageService.periodFor(new Date('2026-12-31T23:59:59Z'))).toBe(
        '2026-12',
      );
    });
  });

  describe('currentUsage', () => {
    it('reports the remaining allowance for a capped plan', async () => {
      usageModel.findOne.mockReturnValue(
        q({ inputTokens: 200, outputTokens: 300, requests: 4 }),
      );

      const usage = await service.currentUsage(ORG_ID);

      expect(usage.used).toBe(500);
      expect(usage.limit).toBe(PLANS.starter.maxAiTokensPerMonth);
      expect(usage.remaining).toBe(PLANS.starter.maxAiTokensPerMonth! - 500);
    });

    it('reports null remaining for an uncapped plan', async () => {
      orgModel.findById.mockReturnValue(q({ planId: 'enterprise' }));

      const usage = await service.currentUsage(ORG_ID);

      expect(usage.limit).toBeNull();
      expect(usage.remaining).toBeNull();
    });
  });
});
