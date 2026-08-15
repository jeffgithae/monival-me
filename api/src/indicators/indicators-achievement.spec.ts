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

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        IndicatorsService,
        { provide: getModelToken(Indicator.name), useValue: indicatorModel },
        { provide: getModelToken(Project.name), useValue: projectModel },
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: getModelToken(IndicatorResult.name), useValue: resultModel },
        { provide: getModelToken(IndicatorTarget.name), useValue: {} },
        { provide: getModelToken(ReportingPeriod.name), useValue: {} },
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

  it('prefers a locked reporting-period result over recomputed activity sums', async () => {
    activityModel.aggregate.mockResolvedValue([
      {
        _id: IND_A,
        approved: 400,
        submitted: 0,
        activityCount: 9,
        lastActivityDate: null,
      },
    ]);
    resultModel.find.mockReturnValue(
      q([{ indicatorId: IND_A, achieved: 999 }]),
    );

    const { indicators } = await service.achievementForProject(
      ORG_ID,
      PROJECT_ID,
    );
    const a = indicators.find((i) => i.indicatorId === IND_A.toString())!;

    expect(a.achieved).toBe(999);
    expect(a.isLocked).toBe(true);
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
