import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { IndicatorsService } from './indicators.service';
import { Indicator } from './schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { IndicatorResult } from '../reporting/schemas/indicator-result.schema';
import { IndicatorTarget } from '../reporting/schemas/indicator-target.schema';
import { ReportingPeriod } from '../reporting/schemas/reporting-period.schema';
import { FormResponse } from '../forms/schemas/form-response.schema';
import { EntitlementsService } from '../organizations/entitlements.service';
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
const IND_A = new Types.ObjectId();
const IND_B = new Types.ObjectId();

describe('IndicatorsService.achievementForProject', () => {
  let service: IndicatorsService;
  let indicatorModel: any;
  let projectModel: any;
  let activityModel: any;
  let resultModel: any;
  let periodModel: any;
  let formResponseModel: any;

  beforeEach(async () => {
    projectModel = {
      findOne: jest.fn().mockReturnValue(q({ _id: PROJECT_ID })),
    };
    indicatorModel = {
      find: jest.fn().mockReturnValue(
        q([
          { _id: IND_A, code: 'OP1', target: 1000, baseline: 0 },
          { _id: IND_B, code: 'OP2', target: 200, baseline: 50 },
        ]),
      ),
    };
    activityModel = { aggregate: jest.fn().mockResolvedValue([]) };
    resultModel = { find: jest.fn().mockReturnValue(q([])) };
    periodModel = { find: jest.fn().mockReturnValue(q([])) };
    formResponseModel = { aggregate: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicatorsService,
        { provide: getModelToken(Indicator.name), useValue: indicatorModel },
        { provide: getModelToken(Project.name), useValue: projectModel },
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: getModelToken(IndicatorResult.name), useValue: resultModel },
        { provide: getModelToken(IndicatorTarget.name), useValue: {} },
        { provide: getModelToken(ReportingPeriod.name), useValue: periodModel },
        { provide: getModelToken(FormResponse.name), useValue: formResponseModel },
        { provide: EntitlementsService, useValue: {} },
        { provide: AuditService, useValue: { log: jest.fn() } },
      ],
    }).compile();

    service = module.get(IndicatorsService);
  });

  it('aggregates server-side over every activity rather than a page of them', async () => {
    await service.achievementForProject(ORG_ID, PROJECT_ID);

    // The whole point of this endpoint: an aggregation with no skip/limit, so
    // the number cannot silently stop at the activities endpoint's page size.
    expect(activityModel.aggregate).toHaveBeenCalledTimes(1);
    const pipeline = activityModel.aggregate.mock.calls[0][0];
    expect(JSON.stringify(pipeline)).not.toMatch(/\$limit|\$skip/);
  });

  it('counts only approved and submitted activities', async () => {
    await service.achievementForProject(ORG_ID, PROJECT_ID);

    const [{ $match }] = activityModel.aggregate.mock.calls[0][0];
    // Drafts and rejected entries must not inflate achievement — that would
    // bypass the submit-and-approve workflow entirely.
    expect($match.status).toEqual({ $in: ['approved', 'submitted'] });
    expect($match.organizationId).toEqual(new Types.ObjectId(ORG_ID));
    expect($match.projectId).toEqual(new Types.ObjectId(PROJECT_ID));
  });

  it('uses approved totals alone once any approved data exists', async () => {
    activityModel.aggregate.mockResolvedValue([
      {
        _id: IND_A,
        approved: 400,
        submitted: 250,
        activityCount: 9,
        lastActivityDate: null,
      },
    ]);

    const { indicators } = await service.achievementForProject(
      ORG_ID,
      PROJECT_ID,
    );
    const a = indicators.find((i) => i.indicatorId === IND_A.toString())!;

    expect(a.achieved).toBe(400);
    expect(a.percentComplete).toBe(40);
  });

  it('falls back to submitted totals when nothing is approved yet', async () => {
    activityModel.aggregate.mockResolvedValue([
      {
        _id: IND_A,
        approved: 0,
        submitted: 300,
        activityCount: 4,
        lastActivityDate: null,
      },
    ]);

    const { indicators } = await service.achievementForProject(
      ORG_ID,
      PROJECT_ID,
    );

    // Mid-approval-cycle a project should not read as zero.
    expect(
      indicators.find((i) => i.indicatorId === IND_A.toString())!.achieved,
    ).toBe(300);
  });

  describe('with a finalised reporting period', () => {
    const PERIOD_ID = new Types.ObjectId();
    const Q1 = { _id: PERIOD_ID, startDate: new Date('2026-01-01'), endDate: new Date('2026-03-31') };

    /** First aggregate: everything. Second: what falls inside finalised periods. */
    const givenActivity = (all: number, insideQ1: number) => {
      activityModel.aggregate
        .mockResolvedValueOnce([{ _id: IND_A, approved: all, submitted: 0, activityCount: 9, lastActivityDate: null }])
        .mockResolvedValueOnce(insideQ1 ? [{ _id: IND_A, approved: insideQ1, submitted: 0 }] : []);
    };

    beforeEach(() => {
      periodModel.find.mockReturnValue(q([Q1]));
    });

    it('keeps the finalised figure for its period even if the activities are later recounted differently', async () => {
      // Q1 was signed off at 999; its activities now sum to 400.
      givenActivity(400, 400);
      resultModel.find.mockReturnValue(q([{ indicatorId: IND_A, reportingPeriodId: PERIOD_ID, achieved: 999 }]));

      const { indicators } = await service.achievementForProject(ORG_ID, PROJECT_ID);
      const a = indicators.find((i) => i.indicatorId === IND_A.toString())!;

      expect(a.achieved).toBe(999);
      expect(a.isLocked).toBe(true);
    });

    it('adds activity logged after the finalised period on top of it', async () => {
      // Q1 signed off at 100; 250 approved in total, so 150 since.
      givenActivity(250, 100);
      resultModel.find.mockReturnValue(q([{ indicatorId: IND_A, reportingPeriodId: PERIOD_ID, achieved: 100 }]));

      const { indicators } = await service.achievementForProject(ORG_ID, PROJECT_ID);

      // One approved quarter must not become the indicator's whole total.
      expect(indicators.find((i) => i.indicatorId === IND_A.toString())!.achieved).toBe(250);
    });

    it('only excludes activity inside the windows of that indicator\'s own finalised results', async () => {
      givenActivity(250, 100);
      resultModel.find.mockReturnValue(q([{ indicatorId: IND_A, reportingPeriodId: PERIOD_ID, achieved: 100 }]));

      await service.achievementForProject(ORG_ID, PROJECT_ID);

      const [{ $match }] = activityModel.aggregate.mock.calls[1][0];
      expect($match.$or).toEqual([{ indicatorId: IND_A, activityDate: { $gte: Q1.startDate, $lte: Q1.endDate } }]);
    });

    it('reports the latest reading for a snapshot indicator instead of adding readings up', async () => {
      indicatorModel.find.mockReturnValue(q([{ _id: IND_A, code: 'OC1', target: 80, baseline: 40, cumulative: false }]));
      resultModel.find.mockReturnValue(q([{ indicatorId: IND_A, reportingPeriodId: PERIOD_ID, achieved: 52 }]));
      activityModel.aggregate
        .mockResolvedValueOnce([{ _id: IND_A, approved: 52 + 61, submitted: 0, activityCount: 2, lastActivityDate: null }])
        .mockResolvedValueOnce([{ _id: IND_A, approved: 52, submitted: 0 }])
        // A survey after Q1 closed read 61%.
        .mockResolvedValueOnce([{ _id: IND_A, quantity: 61, activityDate: new Date('2026-06-15') }]);

      const { indicators } = await service.achievementForProject(ORG_ID, PROJECT_ID);

      expect(indicators[0].achieved).toBe(61);
    });
  });

  it('counts approved form responses alongside activities', async () => {
    activityModel.aggregate.mockResolvedValue([
      { _id: IND_A, approved: 400, submitted: 0, activityCount: 9, lastActivityDate: null },
    ]);
    // 150 more reached the indicator through a form (e.g. a Kobo sync).
    formResponseModel.aggregate.mockResolvedValue([{ _id: IND_A, total: 150, count: 3, last: null }]);

    const { indicators } = await service.achievementForProject(ORG_ID, PROJECT_ID);
    const a = indicators.find((i) => i.indicatorId === IND_A.toString())!;

    expect(a.achieved).toBe(550);
    expect(a.activityCount).toBe(12);
    const [{ $match }] = formResponseModel.aggregate.mock.calls[0][0];
    expect($match.approvalStatus).toBe('approved');
  });

  it('measures percent complete from the baseline, not from zero', async () => {
    activityModel.aggregate.mockResolvedValue([
      {
        _id: IND_B,
        approved: 125,
        submitted: 0,
        activityCount: 3,
        lastActivityDate: null,
      },
    ]);

    const { indicators } = await service.achievementForProject(
      ORG_ID,
      PROJECT_ID,
    );
    const b = indicators.find((i) => i.indicatorId === IND_B.toString())!;

    // baseline 50, target 200 → (125-50)/(200-50) = 50%
    expect(b.percentComplete).toBe(50);
    expect(b.remaining).toBe(75);
  });

  it('reports zero for an indicator with no activity at all', async () => {
    const { indicators } = await service.achievementForProject(
      ORG_ID,
      PROJECT_ID,
    );

    expect(indicators).toHaveLength(2);
    expect(
      indicators.every((i) => i.achieved === 0 && i.activityCount === 0),
    ).toBe(true);
  });

  it('rejects a project belonging to another organisation', async () => {
    projectModel.findOne.mockReturnValue(q(null));

    await expect(
      service.achievementForProject(ORG_ID, PROJECT_ID),
    ).rejects.toThrow(NotFoundException);
    expect(activityModel.aggregate).not.toHaveBeenCalled();
  });
});
