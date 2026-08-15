import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { ActivitiesService } from './activities.service';
import { Activity } from './schemas/activity.schema';
import { ActivityTemplate } from './schemas/activity-template.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Partner } from '../partners/schemas/partner.schema';
import { Beneficiary } from '../beneficiaries/schemas/beneficiary.schema';
import { FormResponse } from '../forms/schemas/form-response.schema';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import { GrantsService } from '../grants/grants.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { WorkflowService } from '../workflows/workflows.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  p.exec = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const ACTIVITY_ID = new Types.ObjectId().toString();
const REVIEWER_ID = new Types.ObjectId().toString();
const SUBMITTER_ID = new Types.ObjectId();
const INDICATOR_ID = new Types.ObjectId();
const GRANT_ID = new Types.ObjectId();
const PROJECT_ID = new Types.ObjectId();

function activityDoc(overrides: Record<string, any> = {}) {
  return {
    _id: new Types.ObjectId(ACTIVITY_ID),
    organizationId: new Types.ObjectId(ORG_ID),
    projectId: PROJECT_ID,
    title: 'Borehole rehabilitation — Kisumu',
    status: 'approved',
    quantity: 40,
    submittedByUserId: SUBMITTER_ID,
    ...overrides,
  };
}

describe('ActivitiesService — review & indicator sync', () => {
  let service: ActivitiesService;
  let activityModel: any;
  let indicatorModel: any;
  let notifications: { create: jest.Mock };
  let audit: { record: jest.Mock };
  let grantsService: { updateGrantSpending: jest.Mock };
  let webhooksService: { dispatch: jest.Mock };
  let workflowService: any;
  let formResponseModel: any;

  beforeEach(async () => {
    activityModel = {
      findOneAndUpdate: jest.fn(),
      // Default: 120 units achieved across approved activities.
      aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 120 }]),
    };
    indicatorModel = { updateOne: jest.fn().mockResolvedValue({}) };
    // Approved form responses now count toward the same indicator total.
    formResponseModel = { aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 0 }]) };
    notifications = { create: jest.fn().mockResolvedValue(undefined) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    grantsService = { updateGrantSpending: jest.fn().mockResolvedValue(undefined) };
    webhooksService = { dispatch: jest.fn().mockResolvedValue(undefined) };
    workflowService = {
      registerOutcomeHandler: jest.fn(),
      assertNoActiveWorkflow: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ActivitiesService,
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: getModelToken(ActivityTemplate.name), useValue: {} },
        { provide: getModelToken(Project.name), useValue: {} },
        { provide: getModelToken(Indicator.name), useValue: indicatorModel },
        { provide: getModelToken(Partner.name), useValue: {} },
        { provide: getModelToken(Beneficiary.name), useValue: {} },
        { provide: getModelToken(FormResponse.name), useValue: formResponseModel },
        { provide: NotificationsService, useValue: notifications },
        { provide: AuditService, useValue: audit },
        { provide: GrantsService, useValue: grantsService },
        { provide: WebhooksService, useValue: webhooksService },
        { provide: WorkflowService, useValue: workflowService },
      ],
    }).compile();

    service = module.get(ActivitiesService);
  });

  describe('review', () => {
    it('stamps status, reviewer and timestamp, scoped to the organisation', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      const [filter, update] = activityModel.findOneAndUpdate.mock.calls[0];
      expect(filter).toEqual({
        _id: ACTIVITY_ID,
        organizationId: new Types.ObjectId(ORG_ID),
      });
      expect(update.status).toBe('approved');
      expect(update.reviewedByUserId).toEqual(new Types.ObjectId(REVIEWER_ID));
      expect(update.reviewedAt).toBeInstanceOf(Date);
    });

    it('stores the rejection reason when rejecting', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ status: 'rejected' })));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'rejected', 'Missing evidence photo');

      const [, update] = activityModel.findOneAndUpdate.mock.calls[0];
      expect(update.rejectionReason).toBe('Missing evidence photo');
    });

    it('omits the rejection reason field entirely on approval', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      const [, update] = activityModel.findOneAndUpdate.mock.calls[0];
      expect(update).not.toHaveProperty('rejectionReason');
    });

    it('throws NotFound when the activity is missing or owned by another org', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(null));

      await expect(
        service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved'),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(audit.record).not.toHaveBeenCalled();
    });
  });

  describe('indicator total sync', () => {
    it('recomputes the indicator total from approved activities only', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ indicatorId: INDICATOR_ID })));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      expect(activityModel.aggregate).toHaveBeenCalledTimes(1);
      expect(formResponseModel.aggregate).toHaveBeenCalledTimes(1);
      const [pipeline] = activityModel.aggregate.mock.calls[0];
      // The $match stage is what keeps unapproved work out of donor-facing
      // totals — assert on it directly rather than on the resulting number.
      expect(pipeline[0].$match).toEqual({
        organizationId: new Types.ObjectId(ORG_ID),
        indicatorId: INDICATOR_ID,
        status: 'approved',
      });

      expect(indicatorModel.updateOne).toHaveBeenCalledWith(
        { _id: INDICATOR_ID, organizationId: new Types.ObjectId(ORG_ID) },
        { $set: expect.objectContaining({ lastAchievedValue: 120 }) },
      );
    });

    it('resets the indicator to zero when no approved activities remain', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ indicatorId: INDICATOR_ID })));
      activityModel.aggregate.mockResolvedValue([]);

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'rejected', 'Bad data');

      expect(indicatorModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $set: expect.objectContaining({ lastAchievedValue: 0 }) },
      );
    });

    it('re-syncs the indicator after a rejection so revoked work stops counting', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(
        q(activityDoc({ status: 'rejected', indicatorId: INDICATOR_ID })),
      );

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'rejected', 'Duplicate entry');

      expect(indicatorModel.updateOne).toHaveBeenCalled();
    });

    it('adds approved form responses to the activity total', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ indicatorId: INDICATOR_ID })));
      formResponseModel.aggregate.mockResolvedValue([{ _id: null, total: 30 }]);

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      // 120 from activities + 30 from form responses.
      expect(indicatorModel.updateOne).toHaveBeenCalledWith(
        expect.anything(),
        { $set: expect.objectContaining({ lastAchievedValue: 150 }) },
      );
    });

    it('skips the sync for activities with no indicator link', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ indicatorId: undefined })));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      expect(activityModel.aggregate).not.toHaveBeenCalled();
      expect(formResponseModel.aggregate).not.toHaveBeenCalled();
      expect(indicatorModel.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('grant spend sync', () => {
    it('recomputes grant spending from approved activity costs', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ grantId: GRANT_ID })));
      activityModel.aggregate.mockResolvedValue([{ _id: null, total: 8500 }]);

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      const [pipeline] = activityModel.aggregate.mock.calls[0];
      expect(pipeline[0].$match).toEqual({
        organizationId: new Types.ObjectId(ORG_ID),
        grantId: GRANT_ID,
        status: 'approved',
      });
      expect(grantsService.updateGrantSpending).toHaveBeenCalledWith(
        GRANT_ID.toString(), ORG_ID, 8500,
      );
    });

    it('skips the sync for activities with no grant link', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ grantId: undefined })));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      expect(grantsService.updateGrantSpending).not.toHaveBeenCalled();
    });

    it('logs rather than silently discarding a spend-sync failure', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ grantId: GRANT_ID })));
      grantsService.updateGrantSpending.mockRejectedValue(new Error('mongo unavailable'));
      const logSpy = jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      // The review itself must still succeed — the sync is bookkeeping.
      await expect(
        service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved'),
      ).resolves.toBeDefined();

      // ...but the failure must not vanish, which is what let a swallowed
      // overspend rejection go unnoticed.
      expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Grant spend sync failed'));
      expect(logSpy.mock.calls[0][0]).toContain('mongo unavailable');
    });
  });

  describe('workflow guard', () => {
    it('blocks a direct review while an approval workflow governs the activity', async () => {
      workflowService.assertNoActiveWorkflow.mockRejectedValue(
        new BadRequestException('An approval workflow is active'),
      );

      await expect(
        service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved'),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(activityModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('skips the guard when the decision arrives from the workflow itself', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));

      await service.review(
        ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved', undefined, { viaWorkflow: true },
      );

      expect(workflowService.assertNoActiveWorkflow).not.toHaveBeenCalled();
      expect(activityModel.findOneAndUpdate).toHaveBeenCalled();
    });
  });

  describe('side effects', () => {
    it('notifies the submitter and records an audit event', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      expect(notifications.create).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          userId: SUBMITTER_ID.toString(),
          type: 'activity.approved',
          entityType: 'activity',
        }),
      );
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({
          organizationId: ORG_ID,
          actorUserId: REVIEWER_ID,
          action: 'activity.approved',
          entityType: 'Activity',
          entityId: ACTIVITY_ID,
        }),
      );
    });

    it('surfaces the rejection reason to the submitter', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc({ status: 'rejected' })));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'rejected', 'Missing GPS');

      const [payload] = notifications.create.mock.calls[0];
      expect(payload.message).toContain('Missing GPS');
    });

    it('dispatches the matching webhook event', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));

      await service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved');

      expect(webhooksService.dispatch).toHaveBeenCalledWith(
        ORG_ID,
        'activity.approved',
        expect.objectContaining({ activityId: ACTIVITY_ID, status: 'approved' }),
        PROJECT_ID.toString(),
      );
    });

    it('does not fail the review when webhook dispatch rejects', async () => {
      activityModel.findOneAndUpdate.mockReturnValue(q(activityDoc()));
      webhooksService.dispatch.mockRejectedValue(new Error('endpoint unreachable'));

      await expect(
        service.review(ORG_ID, ACTIVITY_ID, REVIEWER_ID, 'approved'),
      ).resolves.toBeDefined();

      expect(audit.record).toHaveBeenCalled();
    });
  });
});
