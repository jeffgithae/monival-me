import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ReportingService } from './reporting.service';
import { ReportingPeriod } from './schemas/reporting-period.schema';
import { IndicatorResult } from './schemas/indicator-result.schema';
import { IndicatorTarget } from './schemas/indicator-target.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { User } from '../users/schemas/user.schema';
import { AuditService } from '../audit/audit.service';
import { WorkflowService } from '../workflows/workflows.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { FormResponse } from '../forms/schemas/form-response.schema';

/**
 * Mongoose query-builder stand-in: awaitable, and every chainable method
 * (`.lean()`, `.select()`, …) returns the same thenable.
 */
function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const PROJECT_ID = new Types.ObjectId();
const PERIOD_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

function periodDoc(overrides: Record<string, any> = {}) {
  return {
    _id: PERIOD_ID,
    organizationId: ORG_ID,
    projectId: PROJECT_ID,
    name: 'Q1 2026',
    status: 'open',
    startDate: new Date('2026-01-01'),
    endDate: new Date('2026-03-31'),
    ...overrides,
  };
}

describe('ReportingService — period lifecycle', () => {
  let service: ReportingService;
  let periodModel: any;
  let resultModel: any;
  let audit: { record: jest.Mock };
  let workflowService: any;
  let webhooks: { dispatch: jest.Mock };
  let formResponseModel: any;

  beforeEach(async () => {
    periodModel = {
      findOne: jest.fn(),
      findByIdAndUpdate: jest.fn(),
    };
    resultModel = {
      updateMany: jest.fn().mockResolvedValue({ modifiedCount: 3 }),
      find: jest.fn().mockReturnValue(q([])),
    };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) };
    formResponseModel = { find: jest.fn().mockReturnValue(q([])) };
    workflowService = {
      registerOutcomeHandler: jest.fn(),
      assertNoActiveWorkflow: jest.fn().mockResolvedValue(undefined),
      autoStartForEntity: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReportingService,
        { provide: getModelToken(ReportingPeriod.name), useValue: periodModel },
        { provide: getModelToken(IndicatorResult.name), useValue: resultModel },
        { provide: getModelToken(IndicatorTarget.name), useValue: {} },
        // enrichPeriod() reads these after every successful transition.
        { provide: getModelToken(Project.name), useValue: { findOne: () => q({ name: 'Water Access' }) } },
        { provide: getModelToken(Indicator.name), useValue: {} },
        {
          provide: getModelToken(Activity.name),
          useValue: { countDocuments: jest.fn().mockResolvedValue(0) },
        },
        { provide: getModelToken(User.name), useValue: { findById: () => q({ name: 'A', email: 'a@b.c' }) } },
        { provide: getModelToken(FormResponse.name), useValue: formResponseModel },
        { provide: AuditService, useValue: audit },
        { provide: WorkflowService, useValue: workflowService },
        { provide: WebhooksService, useValue: webhooks },
      ],
    }).compile();

    service = module.get(ReportingService);
  });

  /** Arrange a period in `status` and capture the update passed to the DB. */
  function givenPeriod(status: string) {
    periodModel.findOne.mockReturnValue(q(periodDoc({ status })));
    periodModel.findByIdAndUpdate.mockImplementation((_id: string, update: any) =>
      q(periodDoc({ ...update })),
    );
  }

  describe('lock enforcement', () => {
    it('refuses to move a locked period to any other status', async () => {
      givenPeriod('locked');

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'open', USER_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);

      expect(periodModel.findByIdAndUpdate).not.toHaveBeenCalled();
      expect(resultModel.updateMany).not.toHaveBeenCalled();
    });

    it('refuses to edit the narrative of a locked period', async () => {
      periodModel.findOne.mockReturnValue(q(periodDoc({ status: 'locked' })));

      await expect(
        service.updateNarrative(ORG_ID, PERIOD_ID, { narrative: 'edited' } as any),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('throws NotFound for a period belonging to another organisation', async () => {
      periodModel.findOne.mockReturnValue(q(null));

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'submitted', USER_ID),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('legal transitions', () => {
    it('rejects skipping review: open -> approved', async () => {
      givenPeriod('open');

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'approved', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(periodModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('names the valid next steps in the rejection message', async () => {
      givenPeriod('open');

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'locked', USER_ID),
      ).rejects.toThrow(/Valid next steps: submitted/);
    });

    it('allows open -> submitted and stamps the submitter', async () => {
      givenPeriod('open');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'submitted', USER_ID);

      const [, update] = periodModel.findByIdAndUpdate.mock.calls[0];
      expect(update.status).toBe('submitted');
      expect(update.submittedByUserId).toEqual(new Types.ObjectId(USER_ID));
      expect(update.submittedAt).toBeInstanceOf(Date);
    });

    it('allows approved -> locked and stamps the approver', async () => {
      givenPeriod('approved');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'locked', USER_ID);

      const [, update] = periodModel.findByIdAndUpdate.mock.calls[0];
      expect(update.status).toBe('locked');
      expect(update.approvedByUserId).toEqual(new Types.ObjectId(USER_ID));
    });

    it('clears the approval stamp when an approved period is sent back for revision', async () => {
      givenPeriod('approved');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'open', USER_ID);

      const [, update] = periodModel.findByIdAndUpdate.mock.calls[0];
      expect(update.status).toBe('open');
      expect(update.approvedByUserId).toBeNull();
      expect(update.approvedAt).toBeNull();
    });

    it('clears the submission stamp when a submitted period is sent back', async () => {
      givenPeriod('submitted');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'open', USER_ID);

      const [, update] = periodModel.findByIdAndUpdate.mock.calls[0];
      expect(update.submittedByUserId).toBeNull();
      expect(update.submittedAt).toBeNull();
    });
  });

  describe('result cascade', () => {
    it('propagates the new status to every result in the period', async () => {
      givenPeriod('approved');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'locked', USER_ID);

      expect(resultModel.updateMany).toHaveBeenCalledTimes(1);
      const [filter, update] = resultModel.updateMany.mock.calls[0];
      expect(filter).toEqual({
        organizationId: new Types.ObjectId(ORG_ID),
        reportingPeriodId: new Types.ObjectId(PERIOD_ID),
      });
      expect(update.status).toBe('locked');
    });

    it('scopes the cascade to the caller organisation', async () => {
      givenPeriod('open');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'submitted', USER_ID);

      const [filter] = resultModel.updateMany.mock.calls[0];
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
    });
  });

  describe('workflow guard', () => {
    it('blocks a direct approval while a workflow governs the period', async () => {
      givenPeriod('submitted');
      workflowService.assertNoActiveWorkflow.mockRejectedValue(
        new BadRequestException('An approval workflow is active'),
      );

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'approved', USER_ID),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(periodModel.findByIdAndUpdate).not.toHaveBeenCalled();
    });

    it('skips the guard when the approval arrives from the workflow itself', async () => {
      givenPeriod('submitted');

      await service.transitionPeriod(
        ORG_ID, PERIOD_ID, 'approved', USER_ID, undefined, { viaWorkflow: true },
      );

      expect(workflowService.assertNoActiveWorkflow).not.toHaveBeenCalled();
      expect(periodModel.findByIdAndUpdate).toHaveBeenCalled();
    });

    it('does not guard non-approval transitions', async () => {
      givenPeriod('open');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'submitted', USER_ID);

      expect(workflowService.assertNoActiveWorkflow).not.toHaveBeenCalled();
    });
  });

  describe('approvedResultsForPeriod — the donor-report gate', () => {
    it('returns only approved and locked results, never drafts', async () => {
      await service.approvedResultsForPeriod(ORG_ID, PERIOD_ID);

      const [filter] = resultModel.find.mock.calls[0];
      expect(filter.status).toEqual({ $in: ['approved', 'locked'] });
    });

    it('scopes results to the caller organisation and period', async () => {
      await service.approvedResultsForPeriod(ORG_ID, PERIOD_ID);

      const [filter] = resultModel.find.mock.calls[0];
      expect(filter.organizationId).toEqual(new Types.ObjectId(ORG_ID));
      expect(filter.reportingPeriodId).toEqual(new Types.ObjectId(PERIOD_ID));
    });
  });

  describe('webhook dispatch', () => {
    it('fires report.submitted on submission', async () => {
      givenPeriod('open');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'submitted', USER_ID);

      expect(webhooks.dispatch).toHaveBeenCalledWith(
        ORG_ID, 'report.submitted', expect.objectContaining({ reportingPeriodId: PERIOD_ID }),
        expect.anything(),
      );
    });

    it('fires report.approved on approval', async () => {
      givenPeriod('submitted');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'approved', USER_ID, undefined, { viaWorkflow: true });

      expect(webhooks.dispatch).toHaveBeenCalledWith(
        ORG_ID, 'report.approved', expect.anything(), expect.anything(),
      );
    });

    it('does not fire a report webhook when the transition is rejected', async () => {
      givenPeriod('locked');

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'open', USER_ID),
      ).rejects.toThrow();

      expect(webhooks.dispatch).not.toHaveBeenCalled();
    });
  });

  describe('audit trail', () => {
    it('records every successful transition', async () => {
      givenPeriod('approved');

      await service.transitionPeriod(ORG_ID, PERIOD_ID, 'locked', USER_ID);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          actorUserId: USER_ID,
          action: 'reporting_period.locked',
          entityType: 'ReportingPeriod',
          entityId: PERIOD_ID,
        }),
      );
    });

    it('records nothing when the transition is rejected', async () => {
      givenPeriod('locked');

      await expect(
        service.transitionPeriod(ORG_ID, PERIOD_ID, 'open', USER_ID),
      ).rejects.toThrow();

      expect(audit.record).not.toHaveBeenCalled();
    });
  });
});
