import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReportsService } from './reports.service';
import { Project } from '../projects/schemas/project.schema';
import { Organization } from '../organizations/schemas/organization.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { ReportingService } from '../reporting/reporting.service';
import { AuditService } from '../audit/audit.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const PROJECT_ID = new Types.ObjectId().toString();
const PERIOD_ID = new Types.ObjectId().toString();
const INDICATOR_ID = new Types.ObjectId();

const INDICATOR = {
  _id: INDICATOR_ID,
  code: 'OP1.1',
  title: 'Households with improved water access',
  unit: 'households',
  baseline: 0,
  target: 100,
};

function activity(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(),
    indicatorId: INDICATOR_ID,
    status: 'approved',
    quantity: 10,
    participants: 5,
    activityDate: new Date('2026-02-01'),
    ...overrides,
  };
}

describe('ReportsService — donor report', () => {
  let service: ReportsService;
  let projectModel: any;
  let indicatorModel: any;
  let activityModel: any;
  let reportingService: any;

  beforeEach(async () => {
    projectModel = {
      findOne: jest.fn().mockReturnValue(q({ _id: PROJECT_ID, name: 'Water Access', donor: 'FCDO' })),
    };
    indicatorModel = { find: jest.fn().mockReturnValue(q([INDICATOR])) };
    activityModel = { find: jest.fn().mockReturnValue(q([])) };
    reportingService = {
      getPeriod: jest.fn(),
      approvedResultsForPeriod: jest.fn().mockResolvedValue([]),
      targetsForPeriod: jest.fn().mockResolvedValue([]),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportsService,
        { provide: getModelToken(Project.name), useValue: projectModel },
        { provide: getModelToken(Organization.name), useValue: { findById: () => q({ name: 'Evidara Demo' }) } },
        { provide: getModelToken(Indicator.name), useValue: indicatorModel },
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: ReportingService, useValue: reportingService },
        { provide: AuditService, useValue: { record: jest.fn().mockResolvedValue(undefined) } },
      ],
    }).compile();

    service = module.get(ReportsService);
  });

  it('throws NotFound for a project owned by another organisation', async () => {
    projectModel.findOne.mockReturnValue(q(null));

    await expect(service.donorReport(ORG_ID, PROJECT_ID)).rejects.toBeInstanceOf(NotFoundException);
  });

  describe('activity sourcing', () => {
    it('never pulls draft or rejected activities into the report', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID);

      const [filter] = activityModel.find.mock.calls[0];
      expect(filter.status).toEqual({ $in: ['approved', 'submitted'] });
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
    });

    it('counts only approved activities toward progress when approvals exist', async () => {
      activityModel.find.mockReturnValue(
        q([
          activity({ status: 'approved', quantity: 30 }),
          activity({ status: 'submitted', quantity: 999 }),
        ]),
      );

      const report = await service.donorReport(ORG_ID, PROJECT_ID);

      expect(report.indicators[0].achieved).toBe(30);
    });

    it('falls back to submitted activities when nothing is approved yet', async () => {
      // Documents current behaviour: with zero approved activities the report
      // shows unapproved figures rather than reporting zero progress.
      activityModel.find.mockReturnValue(q([activity({ status: 'submitted', quantity: 25 })]));

      const report = await service.donorReport(ORG_ID, PROJECT_ID);

      expect(report.indicators[0].achieved).toBe(25);
    });
  });

  describe('reporting-period results', () => {
    beforeEach(() => {
      reportingService.getPeriod.mockResolvedValue({
        _id: PERIOD_ID,
        name: 'Q1 2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-03-31'),
        status: 'locked',
      });
    });

    it('reads results through approvedResultsForPeriod so drafts never reach the donor', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID, undefined, undefined, PERIOD_ID);

      expect(reportingService.approvedResultsForPeriod).toHaveBeenCalledWith(ORG_ID, PERIOD_ID);
    });

    it('prefers the locked period result over recomputed activity sums', async () => {
      activityModel.find.mockReturnValue(q([activity({ quantity: 10 })]));
      reportingService.approvedResultsForPeriod.mockResolvedValue([
        {
          indicatorId: INDICATOR_ID,
          achieved: 87,
          activityCount: 12,
          status: 'locked',
          narrative: 'Signed off by the M&E officer.',
        },
      ]);

      const report = await service.donorReport(ORG_ID, PROJECT_ID, undefined, undefined, PERIOD_ID);

      // 87 is the figure that was approved and locked — not the 10 that a
      // recount of current activities would produce.
      expect(report.indicators[0].achieved).toBe(87);
      expect(report.indicators[0].activityCount).toBe(12);
      expect(report.indicators[0].status).toBe('locked');
      expect(report.indicators[0].narrative).toBe('Signed off by the M&E officer.');
    });

    it('marks indicators as calculated when no locked result exists', async () => {
      const report = await service.donorReport(ORG_ID, PROJECT_ID, undefined, undefined, PERIOD_ID);

      expect(report.indicators[0].status).toBe('calculated');
    });

    it('uses the period window for the activity date filter', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID, undefined, undefined, PERIOD_ID);

      const [filter] = activityModel.find.mock.calls[0];
      expect(filter.activityDate.$gte).toEqual(new Date('2026-01-01'));
      expect(filter.activityDate.$lte).toEqual(new Date('2026-03-31'));
    });

    it('lets the period window win over caller-supplied dates', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID, '2020-01-01', '2020-12-31', PERIOD_ID);

      const [filter] = activityModel.find.mock.calls[0];
      expect(filter.activityDate.$gte).toEqual(new Date('2026-01-01'));
    });

    it('applies period-specific targets and baselines over the indicator defaults', async () => {
      reportingService.targetsForPeriod.mockResolvedValue([
        { indicatorId: INDICATOR_ID, target: 50, baseline: 10 },
      ]);
      activityModel.find.mockReturnValue(q([activity({ quantity: 30 })]));

      const report = await service.donorReport(ORG_ID, PROJECT_ID, undefined, undefined, PERIOD_ID);

      expect(report.indicators[0].target).toBe(50);
      expect(report.indicators[0].baseline).toBe(10);
      // (30 - 10) / (50 - 10) = 50%
      expect(report.indicators[0].percentComplete).toBe(50);
    });
  });

  describe('date-range mode', () => {
    it('skips period lookups entirely when no period is given', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID, '2026-01-01', '2026-06-30');

      expect(reportingService.getPeriod).not.toHaveBeenCalled();
      expect(reportingService.approvedResultsForPeriod).not.toHaveBeenCalled();
    });

    it('honours the caller-supplied date range', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID, '2026-01-01', '2026-06-30');

      const [filter] = activityModel.find.mock.calls[0];
      expect(filter.activityDate.$gte).toEqual(new Date('2026-01-01'));
      expect(filter.activityDate.$lte).toEqual(new Date('2026-06-30'));
    });

    it('omits the date filter when neither a period nor a range is given', async () => {
      await service.donorReport(ORG_ID, PROJECT_ID);

      const [filter] = activityModel.find.mock.calls[0];
      expect(filter).not.toHaveProperty('activityDate');
    });
  });

  describe('progress maths', () => {
    it('clamps progress at 100% when achievement overshoots the target', async () => {
      activityModel.find.mockReturnValue(q([activity({ quantity: 500 })]));

      const report = await service.donorReport(ORG_ID, PROJECT_ID);

      expect(report.indicators[0].percentComplete).toBe(100);
    });

    it('reports 0% against a zero-range target that has not been met', async () => {
      indicatorModel.find.mockReturnValue(q([{ ...INDICATOR, baseline: 100, target: 100 }]));
      activityModel.find.mockReturnValue(q([activity({ quantity: 5 })]));

      const report = await service.donorReport(ORG_ID, PROJECT_ID);

      expect(report.indicators[0].percentComplete).toBe(0);
    });
  });
});
