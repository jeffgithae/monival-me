import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { Types } from 'mongoose';
import { DonorsService } from './donors.service';
import { Donor } from './schemas/donor.schema';
import { Grant } from '../grants/schemas/grant.schema';
import { BudgetAllocation } from '../budget/schemas/budget.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { FxService } from '../fx/fx.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.skip = () => p;
  p.limit = () => p;
  p.populate = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const DONOR_ID = new Types.ObjectId();

function grant(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    name: 'WASH Grant',
    donorId: DONOR_ID,
    amount: 400_000,
    amountSpent: 150_000,
    currency: 'USD',
    exchangeRate: null,
    status: 'active',
    parentGrantId: null,
    isOverspent: false,
    endDate: new Date('2027-12-31'),
    nextReportDue: null,
    reportingSchedule: [],
    disbursements: [],
    linkedProjects: [],
    ...overrides,
  };
}

describe('DonorsService — portfolio reporting', () => {
  let service: DonorsService;
  let donorModel: any;
  let grantModel: any;
  let fx: any;

  beforeEach(async () => {
    donorModel = {
      find: jest.fn().mockReturnValue(q([])),
      findById: jest.fn().mockReturnValue(q({ complianceConditions: [] })),
      findOne: jest.fn().mockReturnValue(q({ _id: DONOR_ID, name: 'FCDO', contacts: [] })),
      countDocuments: jest.fn().mockResolvedValue(0),
    };
    grantModel = { find: jest.fn().mockReturnValue(q([])) };
    fx = {
      convert: jest.fn(async (amount: number, from: string, to: string) =>
        from === to
          ? { amount, rate: 1, source: 'identity' }
          : { amount, rate: 1, source: 'cache' },
      ),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DonorsService,
        { provide: getModelToken(Donor.name), useValue: donorModel },
        { provide: getModelToken(Grant.name), useValue: grantModel },
        { provide: getModelToken(BudgetAllocation.name), useValue: { find: () => q([]) } },
        { provide: getModelToken(Project.name), useValue: { find: () => q([]) } },
        { provide: getModelToken(Indicator.name), useValue: { find: () => q([]) } },
        { provide: getModelToken(Organization.name), useValue: { findById: () => q({ baseCurrency: 'USD' }) } },
        { provide: AuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
        { provide: NotificationsService, useValue: { notifyRoles: jest.fn().mockResolvedValue(undefined) } },
        { provide: FxService, useValue: fx },
      ],
    }).compile();

    service = module.get(DonorsService);
  });

  describe('portfolio summary — the always-zero metrics', () => {
    it('reports disbursed from received tranches instead of a phantom field', async () => {
      grantModel.find.mockReturnValue(q([
        grant({
          disbursements: [
            { amount: 120_000, status: 'received' },
            { amount: 80_000, status: 'scheduled' },
          ],
        }),
      ]));

      const s: any = await service.getPortfolioSummary(ORG_ID);

      // Previously read `disbursedAmount`, which never existed → always 0.
      expect(s.totalDisbursed).toBe(120_000);
      expect(s.undisbursedBalance).toBe(280_000);
    });

    it('counts overdue reports from the real nextReportDue field', async () => {
      grantModel.find.mockReturnValue(q([
        grant({ nextReportDue: new Date('2020-01-01'), status: 'active' }),
        grant({ nextReportDue: new Date('2030-01-01'), status: 'active' }),
      ]));

      const s: any = await service.getPortfolioSummary(ORG_ID);

      expect(s.overdueReports).toBe(1);
    });

    it('names the donor-count buckets unambiguously', async () => {
      donorModel.find.mockReturnValue(q([
        { type: 'bilateral', status: 'active' },
        { type: 'foundation', status: 'active' },
      ]));

      const s: any = await service.getPortfolioSummary(ORG_ID);

      // These count donors, and used to sit beside totalGrants as
      // countByType/countByStatus.
      expect(s.donorsByType).toEqual({ bilateral: 1, foundation: 1 });
      expect(s.donorsByStatus).toEqual({ active: 2 });
      expect(s).not.toHaveProperty('countByType');
    });

    it('converts before summing across currencies', async () => {
      grantModel.find.mockReturnValue(q([
        grant({ amount: 100_000, amountSpent: 0, currency: 'USD' }),
        grant({ amount: 1_000_000, amountSpent: 0, currency: 'KES' }),
      ]));
      fx.convert.mockImplementation(async (amount: number, from: string) =>
        from === 'KES'
          ? { amount: amount * 0.0077, rate: 0.0077, source: 'cache' }
          : { amount, rate: 1, source: 'identity' },
      );

      const s: any = await service.getPortfolioSummary(ORG_ID);

      expect(s.totalAwarded).toBe(107_700);
      expect(s.baseCurrency).toBe('USD');
    });

    it('separates prime awards from sub-awards in the totals', async () => {
      const parent = new Types.ObjectId();
      grantModel.find.mockReturnValue(q([
        grant({ amount: 500_000, parentGrantId: null }),
        grant({ amount: 200_000, parentGrantId: parent }),
      ]));

      const s: any = await service.getPortfolioSummary(ORG_ID);

      expect(s.primeAwards).toBe(1);
      expect(s.subAwards).toBe(1);
      // Only the prime counts toward awarded, so the sub isn't double counted.
      expect(s.totalAwarded).toBe(500_000);
    });

    it('surfaces overspent grants', async () => {
      grantModel.find.mockReturnValue(q([grant({ isOverspent: true }), grant()]));

      const s: any = await service.getPortfolioSummary(ORG_ID);

      expect(s.overspentGrants).toBe(1);
    });
  });

  describe('donor deadlines', () => {
    it('returns reports due from the real schedule', async () => {
      const due = new Date(Date.now() + 10 * 86_400_000);
      grantModel.find.mockReturnValue(q([
        grant({
          nextReportDue: due,
          reportingSchedule: [{ dueDate: due, status: 'pending', type: 'narrative' }],
        }),
      ]));

      const res: any = await service.getUpcomingDeadlines(ORG_ID, DONOR_ID.toString());

      // Previously filtered on a field that was never written, so this list
      // could never be non-empty.
      expect(res.reportsDue).toHaveLength(1);
      expect(res.reportsDue[0].daysUntilDue).toBe(10);
      expect(res.reportsDue[0].isOverdue).toBe(false);
      expect(res.reportsDue[0].obligations).toHaveLength(1);
    });

    it('marks a past-due report as overdue', async () => {
      const past = new Date(Date.now() - 5 * 86_400_000);
      grantModel.find.mockReturnValue(q([
        grant({ nextReportDue: past, reportingSchedule: [{ dueDate: past, status: 'overdue' }] }),
      ]));

      const res: any = await service.getUpcomingDeadlines(ORG_ID, DONOR_ID.toString());

      expect(res.reportsDue[0].isOverdue).toBe(true);
    });

    it('omits grants with no outstanding obligation', async () => {
      grantModel.find.mockReturnValue(q([grant({ nextReportDue: null })]));

      const res: any = await service.getUpcomingDeadlines(ORG_ID, DONOR_ID.toString());

      expect(res.reportsDue).toHaveLength(0);
    });
  });

  describe('donor profile', () => {
    it('reports real awarded and spent totals', async () => {
      grantModel.find.mockReturnValue(q([
        grant({ amount: 400_000, amountSpent: 150_000, disbursements: [{ amount: 200_000, status: 'received' }] }),
      ]));

      const p: any = await service.getDonorProfile(ORG_ID, DONOR_ID.toString());

      // Both were permanently 0 — they read totalAmount/spentAmount with no
      // fallback to the fields that actually exist.
      expect(p.summary.totalAwarded).toBe(400_000);
      expect(p.summary.totalSpent).toBe(150_000);
      expect(p.summary.totalDisbursed).toBe(200_000);
      expect(p.summary.remaining).toBe(250_000);
    });
  });

  describe('portfolio export', () => {
    it('drops the permanently blank columns and sources contact from the primary contact', async () => {
      donorModel.find.mockReturnValue(q([{
        _id: DONOR_ID,
        name: 'FCDO',
        type: 'bilateral',
        status: 'active',
        address: { country: 'United Kingdom' },
        contacts: [
          { name: 'Second', email: 'b@x.org', isPrimary: false },
          { name: 'Primary', email: 'a@x.org', isPrimary: true },
        ],
        tags: ['wash'],
      }]));
      grantModel.find.mockReturnValue(q([grant()]));

      const [row]: any = await service.exportPortfolio(ORG_ID);

      expect(row.contactName).toBe('Primary');
      expect(row.contactEmail).toBe('a@x.org');
      expect(row.country).toBe('United Kingdom');
      expect(row).not.toHaveProperty('website');
      expect(row).not.toHaveProperty('reportingCadence');
      expect(row.totalAwarded).toBe(400_000);
    });
  });
});
