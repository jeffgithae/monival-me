import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { FormsService } from './forms.service';
import { FormTemplate } from './schemas/form-template.schema';
import { FormResponse } from './schemas/form-response.schema';
import { Project } from '../projects/schemas/project.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { WorkflowService } from '../workflows/workflows.service';
import { AuditService } from '../audit/audit.service';

function q<T>(value: T): any {
  const p: any = Promise.resolve(value);
  p.lean = () => p;
  p.select = () => p;
  p.sort = () => p;
  return p;
}

const ORG_ID = new Types.ObjectId().toString();
const RESPONSE_ID = new Types.ObjectId().toString();
const TEMPLATE_ID = new Types.ObjectId();
const INDICATOR_ID = new Types.ObjectId();
const REVIEWER_ID = new Types.ObjectId().toString();

describe('FormsService — review & indicator contribution', () => {
  let service: FormsService;
  let responseModel: any;
  let templateModel: any;
  let indicatorModel: any;
  let activityModel: any;
  let audit: { record: jest.Mock };
  let workflowService: any;

  beforeEach(async () => {
    responseModel = {
      findOne: jest.fn().mockReturnValue(q({
        _id: RESPONSE_ID,
        templateId: TEMPLATE_ID,
        indicatorId: INDICATOR_ID,
        answers: { households_reached: 42 },
        approvalStatus: 'pending',
      })),
      findOneAndUpdate: jest.fn().mockImplementation((_f: any, u: any) => q({ _id: RESPONSE_ID, ...u })),
      aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 42 }]),
    };
    templateModel = {
      findById: jest.fn().mockReturnValue(q({ indicatorValueKey: 'households_reached', indicatorId: INDICATOR_ID })),
    };
    indicatorModel = { updateOne: jest.fn().mockResolvedValue({}) };
    activityModel = { aggregate: jest.fn().mockResolvedValue([{ _id: null, total: 100 }]) };
    audit = { record: jest.fn().mockResolvedValue(undefined) };
    workflowService = {
      registerOutcomeHandler: jest.fn(),
      assertNoActiveWorkflow: jest.fn().mockResolvedValue(undefined),
      autoStartForEntity: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        FormsService,
        { provide: getModelToken(FormTemplate.name), useValue: templateModel },
        { provide: getModelToken(FormResponse.name), useValue: responseModel },
        { provide: getModelToken(Project.name), useValue: {} },
        { provide: getModelToken(Indicator.name), useValue: indicatorModel },
        { provide: getModelToken(Activity.name), useValue: activityModel },
        { provide: WorkflowService, useValue: workflowService },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(FormsService);
  });

  describe('approval extracts the indicator contribution', () => {
    it('pulls the numeric answer named by the template', async () => {
      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved');

      const [, update] = responseModel.findOneAndUpdate.mock.calls[0];
      expect(update.approvalStatus).toBe('approved');
      expect(update.indicatorValue).toBe(42);
      expect(update.reviewedAt).toBeInstanceOf(Date);
    });

    it('contributes nothing when the template names no value key', async () => {
      templateModel.findById.mockReturnValue(q({ indicatorId: INDICATOR_ID }));

      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved');

      expect(responseModel.findOneAndUpdate.mock.calls[0][1].indicatorValue).toBe(0);
    });

    it('contributes nothing when the answer is not numeric', async () => {
      responseModel.findOne.mockReturnValue(q({
        _id: RESPONSE_ID, templateId: TEMPLATE_ID, indicatorId: INDICATOR_ID,
        answers: { households_reached: 'many' },
      }));

      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved');

      expect(responseModel.findOneAndUpdate.mock.calls[0][1].indicatorValue).toBe(0);
    });

    it('zeroes the contribution on rejection', async () => {
      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'rejected', 'Duplicate submission');

      const [, update] = responseModel.findOneAndUpdate.mock.calls[0];
      expect(update.approvalStatus).toBe('rejected');
      expect(update.indicatorValue).toBe(0);
      expect(update.rejectionReason).toBe('Duplicate submission');
    });

    it('falls back to the template indicator when the response has none', async () => {
      responseModel.findOne.mockReturnValue(q({
        _id: RESPONSE_ID, templateId: TEMPLATE_ID, answers: { households_reached: 7 },
      }));

      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved');

      expect(indicatorModel.updateOne).toHaveBeenCalled();
    });

    it('throws NotFound for another organisation’s response', async () => {
      responseModel.findOne.mockReturnValue(q(null));

      await expect(
        service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('blocks a direct review while a workflow governs the response', async () => {
      workflowService.assertNoActiveWorkflow.mockRejectedValue(new Error('active workflow'));

      await expect(
        service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved'),
      ).rejects.toThrow();
      expect(responseModel.findOneAndUpdate).not.toHaveBeenCalled();
    });

    it('records an audit event', async () => {
      await service.review(ORG_ID, RESPONSE_ID, REVIEWER_ID, 'approved');

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'form_response.approved', entityType: 'FormResponse' }),
      );
    });
  });

  describe('indicator total unions both evidence sources', () => {
    it('sums approved activities and approved form responses', async () => {
      const total = await service.syncIndicatorTotal(ORG_ID, INDICATOR_ID);

      // 100 from activities + 42 from form responses. Before this, form
      // evidence was invisible to the logframe entirely.
      expect(total).toBe(142);
      expect(indicatorModel.updateOne).toHaveBeenCalledWith(
        { _id: INDICATOR_ID, organizationId: new Types.ObjectId(ORG_ID) },
        { $set: expect.objectContaining({ lastAchievedValue: 142 }) },
      );
    });

    it('counts only approved responses', async () => {
      await service.syncIndicatorTotal(ORG_ID, INDICATOR_ID);

      const [pipeline] = responseModel.aggregate.mock.calls[0];
      expect(pipeline[0].$match).toEqual({
        organizationId: new Types.ObjectId(ORG_ID),
        indicatorId: INDICATOR_ID,
        approvalStatus: 'approved',
      });
    });

    it('counts only approved activities', async () => {
      await service.syncIndicatorTotal(ORG_ID, INDICATOR_ID);

      const [pipeline] = activityModel.aggregate.mock.calls[0];
      expect(pipeline[0].$match.status).toBe('approved');
    });

    it('treats an empty source as zero rather than failing', async () => {
      activityModel.aggregate.mockResolvedValue([]);
      responseModel.aggregate.mockResolvedValue([]);

      expect(await service.syncIndicatorTotal(ORG_ID, INDICATOR_ID)).toBe(0);
    });

    it('returns null and does not throw when aggregation fails', async () => {
      activityModel.aggregate.mockRejectedValue(new Error('mongo down'));
      jest.spyOn((service as any).logger, 'error').mockImplementation(() => {});

      await expect(service.syncIndicatorTotal(ORG_ID, INDICATOR_ID)).resolves.toBeNull();
    });
  });
});
