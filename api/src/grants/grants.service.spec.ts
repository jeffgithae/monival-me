import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { GrantsService } from './grants.service';
import { Grant } from './schemas/grant.schema';
import { Donor } from '../donors/schemas/donor.schema';
import { Project } from '../projects/schemas/project.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { BudgetAllocation } from '../budget/schemas/budget.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from '../workflows/workflows.service';
import { FxService } from '../fx/fx.service';
import { WebhooksService } from '../webhooks/webhooks.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.skip = () => p;
  p.limit = () => p;
  p.populate = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const GRANT_ID = new Types.ObjectId().toString();
const PARENT_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

/** Mongoose-ish document: subdocument arrays expose .id(), doc exposes .save(). */
function grantDoc(overrides: Record<string, any> = {}) {
  const doc: any = {
    _id: new Types.ObjectId(GRANT_ID),
    organizationId: new Types.ObjectId(ORG_ID),
    name: 'WASH Integrated Grant',
    amount: 450_000,
    amountSpent: 148_000,
    currency: 'USD',
    exchangeRate: null,
    status: 'active',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-12-31'),
    parentGrantId: null,
    isOverspent: false,
    overspendAmount: 0,
    indirectCostRate: 0,
    fundClassification: 'restricted',
    matchFunding: { required: false, requiredAmount: 0, securedAmount: 0 },
    disbursements: [],
    reportingSchedule: [],
    amendments: [],
    nextReportDue: null,
    ...overrides,
  };
  for (const key of ['disbursements', 'reportingSchedule', 'amendments']) {
    const arr: any = doc[key];
    arr.id = (id: string) => arr.find((r: any) => r._id?.toString() === id) ?? null;
  }
  doc.save = jest.fn().mockResolvedValue(doc);
  doc.toObject = () => ({ ...doc });
  return doc;
}

describe('GrantsService', () => {
  let service: GrantsService;
  let grantModel: any;
  let orgModel: any;
  let budgetModel: any;
  let audit: { record: jest.Mock };
  let notifications: { notifyRoles: jest.Mock };
  let fx: any;

  beforeEach(async () => {
    grantModel = {
      findById: jest.fn(),
      findOne: jest.fn().mockReturnValue(q(null)),
      find: jest.fn().mockReturnValue(q([])),
      countDocuments: jest.fn().mockResolvedValue(0),
      findByIdAndUpdate: jest.fn(),
      findByIdAndDelete: jest.fn().mockReturnValue(q({ _id: GRANT_ID })),
    };
    orgModel = { findById: jest.fn().mockReturnValue(q({ baseCurrency: 'USD' })) };
    budgetModel = { find: jest.fn().mockReturnValue(q([])) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    notifications = { notifyRoles: jest.fn().mockResolvedValue(undefined) };
    fx = {
      convert: jest.fn(async (amount: number, from: string, to: string) =>
        from === to
          ? { amount, rate: 1, source: 'identity' }
          : { amount, rate: 1, source: 'cache' },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GrantsService,
        { provide: getModelToken(Grant.name), useValue: grantModel },
        { provide: getModelToken(Donor.name), useValue: { findOne: () => q({ _id: 'd' }) } },
        { provide: getModelToken(Project.name), useValue: { find: () => q([]) } },
        { provide: getModelToken(Organization.name), useValue: orgModel },
        { provide: getModelToken(BudgetAllocation.name), useValue: budgetModel },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        { provide: WorkflowService, useValue: { autoStartForEntity: jest.fn().mockResolvedValue(undefined) } },
        { provide: FxService, useValue: fx },
        { provide: WebhooksService, useValue: { dispatch: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(GrantsService);
  });

  const given = (doc: any) => grantModel.findById.mockReturnValue(q(doc));

  // ── The original bug ────────────────────────────────────────────────────────

  describe('overspend (previously swallowed)', () => {
    it('records spend above the award instead of rejecting it', async () => {
      const doc = grantDoc();
      given(doc);

      const saved = await service.updateGrantSpending(GRANT_ID, ORG_ID, 500_000);

      // It used to throw ForbiddenException here, and the only caller
      // discarded the error — freezing amountSpent at its last good value.
      expect(saved.amountSpent).toBe(500_000);
      expect(saved.isOverspent).toBe(true);
      expect(saved.overspendAmount).toBe(50_000);
    });

    it('audits and notifies finance on the transition into overspend', async () => {
      given(grantDoc());

      await service.updateGrantSpending(GRANT_ID, ORG_ID, 500_000);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'grant.overspent', entityId: GRANT_ID }),
      );
      expect(notifications.notifyRoles).toHaveBeenCalled();
    });

    it('does not re-notify while the grant stays overspent', async () => {
      given(grantDoc({ isOverspent: true, overspendAmount: 10_000, amountSpent: 460_000 }));

      await service.updateGrantSpending(GRANT_ID, ORG_ID, 470_000);

      expect(notifications.notifyRoles).not.toHaveBeenCalled();
    });

    it('clears the flag when spend falls back within the award', async () => {
      const doc = grantDoc({ isOverspent: true, overspendAmount: 50_000, amountSpent: 500_000 });
      given(doc);

      const saved = await service.updateGrantSpending(GRANT_ID, ORG_ID, 100_000);

      expect(saved.isOverspent).toBe(false);
      expect(saved.overspendAmount).toBe(0);
    });

    it('floors negative spend at zero', async () => {
      given(grantDoc());
      const saved = await service.updateGrantSpending(GRANT_ID, ORG_ID, -5);
      expect(saved.amountSpent).toBe(0);
    });
  });

  // ── Disbursements ───────────────────────────────────────────────────────────

  describe('disbursements', () => {
    it('counts only received tranches toward disbursed', async () => {
      given(grantDoc({
        disbursements: [
          { _id: new Types.ObjectId(), amount: 100_000, status: 'received' },
          { _id: new Types.ObjectId(), amount: 50_000, status: 'scheduled' },
          { _id: new Types.ObjectId(), amount: 25_000, status: 'cancelled' },
        ],
      }));

      const res: any = await service.getOne(GRANT_ID, ORG_ID);

      // Scheduled money is not disbursed money.
      expect(res.disbursedAmount).toBe(100_000);
      expect(res.undisbursedAmount).toBe(350_000);
    });

    it('defaults a tranche currency to the grant currency', async () => {
      const doc = grantDoc({ currency: 'KES' });
      given(doc);

      await service.addDisbursement(
        GRANT_ID, ORG_ID,
        { plannedDate: '2026-03-01', amount: 1000 } as any,
        USER_ID,
      );

      expect(doc.disbursements[0].currency).toBe('KES');
    });

    it('stamps a received date when a tranche is marked received without one', async () => {
      const rowId = new Types.ObjectId();
      const doc = grantDoc({
        disbursements: [{ _id: rowId, amount: 1000, status: 'scheduled', plannedDate: new Date() }],
      });
      given(doc);

      await service.updateDisbursement(
        GRANT_ID, rowId.toString(), ORG_ID, { status: 'received' } as any, USER_ID,
      );

      expect(doc.disbursements[0].receivedDate).toBeInstanceOf(Date);
    });

    it('throws NotFound for an unknown tranche', async () => {
      given(grantDoc());

      await expect(
        service.updateDisbursement(GRANT_ID, new Types.ObjectId().toString(), ORG_ID, {} as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  // ── Reporting obligations ───────────────────────────────────────────────────

  describe('reporting schedule', () => {
    it('derives nextReportDue from the earliest outstanding obligation', async () => {
      const doc = grantDoc({
        reportingSchedule: [
          { _id: new Types.ObjectId(), dueDate: new Date('2027-06-01'), status: 'pending' },
          { _id: new Types.ObjectId(), dueDate: new Date('2027-03-01'), status: 'pending' },
          { _id: new Types.ObjectId(), dueDate: new Date('2026-01-01'), status: 'submitted' },
        ],
      });
      given(doc);

      await service.addObligation(
        GRANT_ID, ORG_ID, { dueDate: '2027-09-01', type: 'final' } as any, USER_ID,
      );

      // Submitted obligations are excluded; earliest open one wins.
      expect(doc.nextReportDue).toEqual(new Date('2027-03-01'));
    });

    it('flips a past-due pending obligation to overdue', async () => {
      const doc = grantDoc({
        reportingSchedule: [
          { _id: new Types.ObjectId(), dueDate: new Date('2020-01-01'), status: 'pending' },
        ],
      });
      given(doc);

      await service.addObligation(GRANT_ID, ORG_ID, { dueDate: '2030-01-01' } as any, USER_ID);

      expect(doc.reportingSchedule[0].status).toBe('overdue');
    });

    it('clears nextReportDue once everything is submitted', async () => {
      const rowId = new Types.ObjectId();
      const doc = grantDoc({
        reportingSchedule: [{ _id: rowId, dueDate: new Date('2027-01-01'), status: 'pending' }],
      });
      given(doc);

      await service.updateObligation(
        GRANT_ID, rowId.toString(), ORG_ID, { status: 'submitted' } as any, USER_ID,
      );

      expect(doc.nextReportDue).toBeNull();
      expect(doc.reportingSchedule[0].submittedDate).toBeInstanceOf(Date);
    });

    it('seeds a default schedule from the legacy reporting booleans', async () => {
      const created: any = {
        reportingSchedule: [],
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-06-30'),
        requiresMonthlyReporting: true,
        requiresFinalReport: true,
        save: jest.fn().mockImplementation(function (this: any) { return this; }),
        _id: new Types.ObjectId(GRANT_ID),
      };
      (grantModel as any).mockImpl = created;
      // Model is used as a constructor in create(); stub that shape.
      const Ctor: any = function () { return created; };
      Object.assign(Ctor, grantModel);
      (service as any).grantModel = Ctor;

      await service.create(ORG_ID, {
        name: 'X', amount: 1000,
        startDate: '2026-01-01', endDate: '2026-06-30',
        requiresMonthlyReporting: true, requiresFinalReport: true,
      } as any);

      // 5 monthly + 1 final
      expect(created.reportingSchedule.length).toBe(6);
      expect(created.reportingSchedule.some((o: any) => o.type === 'final')).toBe(true);
    });
  });

  // ── Amendments ──────────────────────────────────────────────────────────────

  describe('amendments', () => {
    it('applies a no-cost extension and records the previous end date', async () => {
      const doc = grantDoc();
      given(doc);

      await service.recordAmendment(GRANT_ID, ORG_ID, {
        effectiveDate: '2026-11-01',
        type: 'no_cost_extension',
        reason: 'Delayed procurement',
        newEndDate: '2027-06-30',
      } as any, USER_ID);

      expect(doc.endDate).toEqual(new Date('2027-06-30'));
      expect(doc.amendments[0].previousEndDate).toEqual(new Date('2026-12-31'));
      expect(doc.amendments[0].newEndDate).toEqual(new Date('2027-06-30'));
    });

    it('applies a budget revision and records the previous amount', async () => {
      const doc = grantDoc();
      given(doc);

      await service.recordAmendment(GRANT_ID, ORG_ID, {
        effectiveDate: '2026-06-01', type: 'budget_revision',
        reason: 'Donor increased ceiling', newAmount: 600_000,
      } as any, USER_ID);

      expect(doc.amount).toBe(600_000);
      expect(doc.amendments[0].previousAmount).toBe(450_000);
    });

    it('flags overspend when a revision cuts the ceiling below recorded spend', async () => {
      const doc = grantDoc({ amountSpent: 300_000 });
      given(doc);

      await service.recordAmendment(GRANT_ID, ORG_ID, {
        effectiveDate: '2026-06-01', type: 'budget_revision',
        reason: 'Donor clawback', newAmount: 250_000,
      } as any, USER_ID);

      expect(doc.isOverspent).toBe(true);
      expect(doc.overspendAmount).toBe(50_000);
    });

    it('closes the grant on a termination amendment', async () => {
      const doc = grantDoc();
      given(doc);

      await service.recordAmendment(GRANT_ID, ORG_ID, {
        effectiveDate: '2026-06-01', type: 'termination', reason: 'Donor withdrew',
      } as any, USER_ID);

      expect(doc.status).toBe('closed');
    });

    it('rejects an end date before the award start', async () => {
      given(grantDoc());

      await expect(
        service.recordAmendment(GRANT_ID, ORG_ID, {
          effectiveDate: '2026-06-01', type: 'no_cost_extension',
          reason: 'typo', newEndDate: '2025-01-01',
        } as any),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  // ── Sub-awards ──────────────────────────────────────────────────────────────

  describe('sub-awards', () => {
    it('rejects a parent that is itself a sub-award', async () => {
      grantModel.findOne.mockReturnValue(q({ _id: PARENT_ID, parentGrantId: new Types.ObjectId() }));

      await expect(
        service.create(ORG_ID, {
          name: 'Sub', amount: 100, startDate: '2026-01-01', endDate: '2026-12-31',
          parentGrantId: PARENT_ID,
        } as any),
      ).rejects.toThrow(/one level/i);
    });

    it('rejects an unknown parent award', async () => {
      grantModel.findOne.mockReturnValue(q(null));

      await expect(
        service.create(ORG_ID, {
          name: 'Sub', amount: 100, startDate: '2026-01-01', endDate: '2026-12-31',
          parentGrantId: PARENT_ID,
        } as any),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to make a grant that already has children into a sub-award', async () => {
      grantModel.findOne.mockReturnValue(q({ _id: PARENT_ID, parentGrantId: null }));
      grantModel.countDocuments.mockResolvedValue(2);

      await expect(
        service.update(GRANT_ID, ORG_ID, { parentGrantId: PARENT_ID } as any),
      ).rejects.toThrow(/already has sub-awards/i);
    });

    it('refuses to delete a prime that still holds sub-awards', async () => {
      given(grantDoc());
      grantModel.countDocuments.mockResolvedValue(3);

      await expect(service.remove(GRANT_ID, ORG_ID)).rejects.toThrow(/3 sub-award/);
      expect(grantModel.findByIdAndDelete).not.toHaveBeenCalled();
    });

    it('reports the committed / retained split across an award tree', async () => {
      given(grantDoc({ amount: 1_000_000 }));
      grantModel.find.mockReturnValue(q([
        { amount: 300_000, currency: 'USD' },
        { amount: 200_000, currency: 'USD' },
      ]));

      const tree: any = await service.getAwardTree(GRANT_ID, ORG_ID);

      expect(tree.subAwardCount).toBe(2);
      expect(tree.committedToSubAwards).toBe(500_000);
      expect(tree.retainedByPrime).toBe(500_000);
      expect(tree.overCommitted).toBe(false);
    });

    it('flags an over-committed prime award', async () => {
      given(grantDoc({ amount: 400_000 }));
      grantModel.find.mockReturnValue(q([{ amount: 500_000, currency: 'USD' }]));

      const tree: any = await service.getAwardTree(GRANT_ID, ORG_ID);

      expect(tree.overCommitted).toBe(true);
      expect(tree.retainedByPrime).toBe(-100_000);
    });
  });

  // ── Currency ────────────────────────────────────────────────────────────────

  describe('portfolio totals', () => {
    it('converts each award into the base currency before summing', async () => {
      orgModel.findById.mockReturnValue(q({ baseCurrency: 'USD' }));
      grantModel.find.mockReturnValue(q([
        { amount: 100_000, amountSpent: 0, currency: 'USD', disbursements: [] },
        { amount: 1_000_000, amountSpent: 0, currency: 'KES', disbursements: [] },
      ]));
      fx.convert.mockImplementation(async (amount: number, from: string) =>
        from === 'KES'
          ? { amount: amount * 0.0077, rate: 0.0077, source: 'cache' }
          : { amount, rate: 1, source: 'identity' },
      );

      const summary: any = await service.getBudgetSummary(ORG_ID);

      // 100,000 USD + 1,000,000 KES @ 0.0077 = 107,700 — not 1,100,000.
      expect(summary.totalGrantAmount).toBe(107_700);
      expect(summary.baseCurrency).toBe('USD');
    });

    it('excludes unconvertible currencies from the total and reports them', async () => {
      grantModel.find.mockReturnValue(q([
        { amount: 100_000, amountSpent: 0, currency: 'USD', disbursements: [] },
        { amount: 50_000, amountSpent: 0, currency: 'XOF', disbursements: [] },
      ]));
      fx.convert.mockImplementation(async (amount: number, from: string) =>
        from === 'XOF'
          ? { amount: 0, rate: 0, source: 'unavailable' }
          : { amount, rate: 1, source: 'identity' },
      );

      const summary: any = await service.getBudgetSummary(ORG_ID);

      expect(summary.totalGrantAmount).toBe(100_000);
      expect(summary.unconvertible).toEqual([{ currency: 'XOF', amount: 50_000 }]);
    });

    it('excludes sub-awards so a prime and its sub are not double counted', async () => {
      grantModel.find.mockReturnValue(q([]));

      await service.getBudgetSummary(ORG_ID);

      const [filter] = grantModel.find.mock.calls[0];
      expect(filter.parentGrantId).toBeNull();
    });
  });

  // ── Budget rollup ───────────────────────────────────────────────────────────

  describe('financial rollup', () => {
    it('aggregates allocations by cost category', async () => {
      given(grantDoc());
      budgetModel.find.mockReturnValue(q([
        { name: 'A', category: 'personnel', allocatedAmount: 100, spentAmount: 50, committedAmount: 10, uncommittedAmount: 40 },
        { name: 'B', category: 'personnel', allocatedAmount: 100, spentAmount: 25, committedAmount: 0, uncommittedAmount: 75 },
        { name: 'C', category: 'travel', allocatedAmount: 50, spentAmount: 50, committedAmount: 0, uncommittedAmount: 0 },
      ]));

      const roll: any = await service.getFinancialRollup(GRANT_ID, ORG_ID);

      const personnel = roll.byCategory.find((c: any) => c.category === 'personnel');
      expect(personnel).toMatchObject({ allocated: 200, spent: 75, utilisationPct: 38 });
      expect(roll.budget.allocated).toBe(250);
    });

    it('flags award money not yet pushed into any allocation', async () => {
      given(grantDoc({ amount: 1000 }));
      budgetModel.find.mockReturnValue(q([{ allocatedAmount: 400, spentAmount: 0, committedAmount: 0, uncommittedAmount: 400 }]));

      const roll: any = await service.getFinancialRollup(GRANT_ID, ORG_ID);

      expect(roll.budget.unallocated).toBe(600);
      expect(roll.budget.overAllocated).toBe(false);
    });

    it('detects allocations exceeding the award', async () => {
      given(grantDoc({ amount: 1000 }));
      budgetModel.find.mockReturnValue(q([{ allocatedAmount: 1500, spentAmount: 0, committedAmount: 0, uncommittedAmount: 0 }]));

      const roll: any = await service.getFinancialRollup(GRANT_ID, ORG_ID);

      expect(roll.budget.overAllocated).toBe(true);
    });

    it('compares burn rate against elapsed award time', async () => {
      // Half the money spent; award window entirely in the past.
      given(grantDoc({
        amount: 1000, amountSpent: 500,
        startDate: new Date('2020-01-01'), endDate: new Date('2021-01-01'),
      }));

      const roll: any = await service.getFinancialRollup(GRANT_ID, ORG_ID);

      expect(roll.burnRate.spendPct).toBe(50);
      expect(roll.burnRate.elapsedPct).toBe(100);
      expect(roll.burnRate.status).toBe('behind');
    });

    // Thresholds are stored as one { warningPercent, criticalPercent } object
    // per allocation (see BudgetAlertThreshold), not as a list.
    it('surfaces the highest alert threshold an allocation has crossed', async () => {
      given(grantDoc());
      budgetModel.find.mockReturnValue(q([
        {
          name: 'Personnel', category: 'personnel',
          allocatedAmount: 100, spentAmount: 95, committedAmount: 0, uncommittedAmount: 5,
          alertThresholds: { warningPercent: 75, criticalPercent: 90 },
        },
        {
          name: 'Travel', category: 'travel',
          allocatedAmount: 100, spentAmount: 80, committedAmount: 0, uncommittedAmount: 20,
          alertThresholds: { warningPercent: 75, criticalPercent: 90 },
        },
        {
          name: 'Equipment', category: 'equipment',
          allocatedAmount: 100, spentAmount: 10, committedAmount: 0, uncommittedAmount: 90,
          alertThresholds: { warningPercent: 75, criticalPercent: 90 },
        },
        // No thresholds configured at all must not break the roll-up.
        { name: 'Other', category: 'project', allocatedAmount: 100, spentAmount: 99, committedAmount: 0, uncommittedAmount: 1 },
      ]));

      const roll: any = await service.getFinancialRollup(GRANT_ID, ORG_ID);

      expect(roll.breachedThresholds).toEqual([
        { allocation: 'Personnel', category: 'personnel', level: 'critical', threshold: 90, spentPct: 95 },
        { allocation: 'Travel', category: 'travel', level: 'warning', threshold: 75, spentPct: 80 },
      ]);
    });
  });

  // ── Derived figures ─────────────────────────────────────────────────────────

  describe('derived figures', () => {
    it('computes indirect cost recovery and match-funding gap', async () => {
      given(grantDoc({
        amountSpent: 200_000,
        indirectCostRate: 12.5,
        matchFunding: { required: true, requiredAmount: 50_000, securedAmount: 20_000 },
      }));

      const res: any = await service.getOne(GRANT_ID, ORG_ID);

      expect(res.indirectCostAmount).toBe(25_000);
      expect(res.matchFundingGapAmount).toBe(30_000);
    });

    it('reports a null base-currency amount when no rate exists', async () => {
      given(grantDoc({ currency: 'XOF' }));
      fx.convert.mockResolvedValue({ amount: 0, rate: 0, source: 'unavailable' });

      const res: any = await service.getOne(GRANT_ID, ORG_ID);

      expect(res.amountInBaseCurrency).toBeNull();
      expect(res.exchangeRateSource).toBe('unavailable');
    });
  });

  // ── Search hardening ────────────────────────────────────────────────────────

  it('escapes regex metacharacters in grant search', async () => {
    await service.findAll(ORG_ID, { search: '(a+)+$' });

    const [query] = grantModel.find.mock.calls[0];
    expect(query.$or[0].name.source).toContain('\\(a\\+\\)\\+\\$');
  });
});
