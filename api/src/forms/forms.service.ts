import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { WorkflowService } from '../workflows/workflows.service';
import { AuditService } from '../audit/audit.service';
import { CreateFormResponseDto } from './dto/create-form-response.dto';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import { FormResponse } from './schemas/form-response.schema';
import { FormTemplate } from './schemas/form-template.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class FormsService implements OnModuleInit {
  private readonly logger = new Logger(FormsService.name);

  constructor(
    @InjectModel(FormTemplate.name) private readonly templateModel: Model<FormTemplate>,
    @InjectModel(FormResponse.name) private readonly responseModel: Model<FormResponse>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    private readonly workflowService: WorkflowService,
    private readonly audit: AuditService,
  ) {}

  onModuleInit() {
    // A workflow decision on a form response must re-sync the indicator, the
    // same way an activity review does — the registry flips `approvalStatus`,
    // but only this handler recomputes achievement from it.
    this.workflowService.registerOutcomeHandler('form_response', async (ctx) => {
      await this.review(
        ctx.organizationId,
        ctx.entityId,
        ctx.actorUserId,
        ctx.outcome === 'approved' ? 'approved' : 'rejected',
        ctx.outcome === 'rejected' ? ctx.comment : undefined,
        { viaWorkflow: true },
      );
    });
  }

  // ─── Review & indicator contribution ────────────────────────────────────────

  /**
   * Pull the numeric contribution out of a response's answers using the
   * template's `indicatorValueKey`. Non-numeric or missing answers contribute
   * nothing rather than throwing — a malformed submission should not block a
   * reviewer.
   */
  private extractIndicatorValue(
    template: { indicatorValueKey?: string } | null,
    answers: Record<string, unknown> = {},
  ): number {
    const key = template?.indicatorValueKey;
    if (!key) return 0;
    const raw = answers[key];
    const n = typeof raw === 'number' ? raw : Number(raw);
    return Number.isFinite(n) ? n : 0;
  }

  /**
   * Approve or reject a submitted response. Approving is what makes it count
   * toward the linked indicator.
   */
  async review(
    organizationId: string,
    id: string,
    reviewerId: string,
    approvalStatus: 'approved' | 'rejected',
    rejectionReason?: string,
    opts?: { viaWorkflow?: boolean },
  ) {
    if (!opts?.viaWorkflow) {
      await this.workflowService.assertNoActiveWorkflow(organizationId, 'form_response', id);
    }

    const orgId = new Types.ObjectId(organizationId);
    const existing = await this.responseModel.findOne({ _id: id, organizationId: orgId }).lean();
    if (!existing) throw new NotFoundException('Form response not found');

    const template = existing.templateId
      ? await this.templateModel.findById(existing.templateId).select('indicatorValueKey name').lean()
      : null;

    // Resolve the indicator link from the response, falling back to the
    // template's — integrations set it on the template only.
    const indicatorId =
      existing.indicatorId ??
      (await this.templateModel.findById(existing.templateId).select('indicatorId').lean())?.indicatorId;

    const indicatorValue =
      approvalStatus === 'approved'
        ? this.extractIndicatorValue(template, existing.answers as Record<string, unknown>)
        : 0;

    const updated = await this.responseModel
      .findOneAndUpdate(
        { _id: id, organizationId: orgId },
        {
          approvalStatus,
          reviewedByUserId: new Types.ObjectId(reviewerId),
          reviewedAt: new Date(),
          indicatorValue,
          ...(indicatorId ? { indicatorId } : {}),
          ...(rejectionReason ? { rejectionReason } : {}),
        },
        { new: true },
      )
      .lean();

    if (indicatorId) {
      await this.syncIndicatorTotal(organizationId, new Types.ObjectId(indicatorId));
    }

    await this.audit.record({
      organizationId,
      actorUserId: reviewerId,
      action: `form_response.${approvalStatus}`,
      entityType: 'FormResponse',
      entityId: id,
      reason: rejectionReason,
      before: { approvalStatus: existing.approvalStatus, indicatorValue: existing.indicatorValue ?? 0 },
      after: { approvalStatus, indicatorValue },
      metadata: { indicatorId: indicatorId?.toString() },
    });

    return updated;
  }

  /**
   * Recompute an indicator's achieved total from BOTH sources of evidence.
   *
   * Activities were previously the only input, so anything captured through a
   * form — including every Kobo/ODK/CommCare sync — was invisible to the
   * logframe, the reporting period, and the donor report.
   */
  async syncIndicatorTotal(organizationId: string, indicatorId: Types.ObjectId) {
    const orgId = new Types.ObjectId(organizationId);
    try {
      const [actAgg, formAgg] = await Promise.all([
        this.activityModel.aggregate([
          { $match: { organizationId: orgId, indicatorId, status: 'approved' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$quantity', 0] } } } },
        ]),
        this.responseModel.aggregate([
          { $match: { organizationId: orgId, indicatorId, approvalStatus: 'approved' } },
          { $group: { _id: null, total: { $sum: { $ifNull: ['$indicatorValue', 0] } } } },
        ]),
      ]);

      const total = (actAgg[0]?.total ?? 0) + (formAgg[0]?.total ?? 0);
      await this.indicatorModel.updateOne(
        { _id: indicatorId, organizationId: orgId },
        { $set: { lastAchievedValue: total, lastAchievedDate: new Date() } },
      );
      return total;
    } catch (err) {
      this.logger.error(
        `Indicator sync failed for ${indicatorId.toString()} (org ${organizationId}): ` +
        `${err instanceof Error ? err.message : String(err)}`,
      );
      return null;
    }
  }

  findTemplates(organizationId: string, projectId?: string) {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (projectId) {
      query.projectId = new Types.ObjectId(projectId);
    }
    return this.templateModel.find(query).sort({ createdAt: -1 }).lean();
  }

  async findTemplate(organizationId: string, id: string) {
    const template = await this.templateModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!template) {
      throw new NotFoundException('Form template not found');
    }
    return template;
  }

  async createTemplate(organizationId: string, dto: CreateFormTemplateDto) {
    if (dto.projectId) {
      await this.assertProjectExists(organizationId, dto.projectId);
    }
    if (dto.indicatorId) {
      await this.assertIndicatorExists(organizationId, dto.indicatorId);
    }

    return this.templateModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      name: dto.name,
      description: dto.description,
      status: dto.status ?? 'draft',
      // Without this the key never persists, so an approved response has no
      // quantity to contribute and the indicator link is decorative.
      indicatorValueKey: dto.indicatorValueKey,
      sections: (dto.sections ?? []) as unknown as Record<string, unknown>[],
    });
  }

  async updateTemplate(organizationId: string, id: string, dto: UpdateFormTemplateDto) {
    if (dto.projectId) {
      await this.assertProjectExists(organizationId, dto.projectId);
    }
    if (dto.indicatorId) {
      await this.assertIndicatorExists(organizationId, dto.indicatorId);
    }

    const template = await this.templateModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          ...dto,
          projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
          indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
        },
        { new: true },
      )
      .lean();
    if (!template) {
      throw new NotFoundException('Form template not found');
    }
    return template;
  }

  async removeTemplate(organizationId: string, id: string) {
    const result = await this.templateModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Form template not found');
    }
    return { deleted: true };
  }

  findResponses(organizationId: string, projectId?: string) {
    const query: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (projectId) {
      query.projectId = new Types.ObjectId(projectId);
    }
    return this.responseModel.find(query).sort({ collectedAt: -1 }).lean();
  }

  async findResponse(organizationId: string, id: string) {
    const response = await this.responseModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!response) {
      throw new NotFoundException('Form response not found');
    }
    return response;
  }

  async createResponse(organizationId: string, dto: CreateFormResponseDto, submittedByUserId?: string) {
    await this.assertProjectExists(organizationId, dto.projectId);
    const template = await this.assertTemplateExists(organizationId, dto.templateId);
    if (dto.indicatorId) {
      await this.assertIndicatorExists(organizationId, dto.indicatorId);
    }
    if (dto.activityId) {
      await this.assertActivityExists(organizationId, dto.activityId);
    }

    this.validateResponse(template, dto.answers ?? {});

    const response = await this.responseModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      templateId: new Types.ObjectId(dto.templateId),
      indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      activityId: dto.activityId ? new Types.ObjectId(dto.activityId) : undefined,
      submittedByUserId: submittedByUserId ? new Types.ObjectId(submittedByUserId) : undefined,
      collectedAt: new Date(),
      answers: dto.answers ?? {},
      status: dto.status ?? 'submitted',
    });

    // Submitted responses kick off the org's default form-response workflow, if configured.
    if (submittedByUserId && (dto.status ?? 'submitted') === 'submitted') {
      this.workflowService.autoStartForEntity(
        organizationId,
        'form_response',
        String(response._id),
        `${template.name ?? 'Form'} response`,
        submittedByUserId,
      ).catch(() => {});
    }

    return response;
  }

  // ─── Offline sync ───────────────────────────────────────────────────────────
  //
  // Field workers fill out custom survey templates on the mobile PWA while
  // offline. When connectivity is restored, the client pushes the queued
  // batch here. Each record carries a client-generated UUID (`clientId`)
  // used as an idempotency key — see activities.service.ts#offlineSync for
  // the same pattern applied to Activity records.
  //
  // Reuses createResponse() per item, so the same project/template/indicator/
  // activity existence checks and answer-shape validation run on every
  // synced record — a template that was edited or archived while the worker
  // was offline surfaces as a per-record error rather than corrupting data.
  //
  async offlineSync(
    organizationId: string,
    items: Array<CreateFormResponseDto & { clientId: string }>,
    submittedByUserId?: string,
  ) {
    if (!items?.length) return { synced: 0, skipped: 0, errors: [], results: [] };

    const orgId = new Types.ObjectId(organizationId);

    const clientIds = items.map(i => i.clientId).filter(Boolean);
    const existing  = await this.responseModel
      .find({ organizationId: orgId, clientId: { $in: clientIds } })
      .select('clientId')
      .lean();
    const alreadySynced = new Set(existing.map(e => (e as any).clientId as string));

    const results: Array<{
      clientId: string;
      status: 'synced' | 'skipped' | 'error';
      responseId?: string;
      message?: string;
    }> = [];

    let synced  = 0;
    let skipped = 0;

    for (const item of items) {
      if (!item.clientId) {
        results.push({ clientId: '', status: 'error', message: 'clientId is required for offline sync.' });
        continue;
      }

      if (alreadySynced.has(item.clientId)) {
        results.push({ clientId: item.clientId, status: 'skipped' });
        skipped++;
        continue;
      }

      try {
        const response = await this.createResponse(organizationId, item, submittedByUserId);
        await this.responseModel.updateOne(
          { _id: response._id },
          { $set: { clientId: item.clientId, syncedFromOffline: true } },
        );
        results.push({ clientId: item.clientId, status: 'synced', responseId: response._id.toString() });
        synced++;
      } catch (err: any) {
        results.push({ clientId: item.clientId, status: 'error', message: err.message });
      }
    }

    return {
      synced,
      skipped,
      errors: results.filter(r => r.status === 'error'),
      results,
    };
  }

  private async assertProjectExists(organizationId: string, projectId: string) {
    const exists = await this.projectModel.exists({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!exists) {
      throw new NotFoundException('Project not found');
    }
  }

  private async assertTemplateExists(organizationId: string, templateId: string) {
    const template = await this.templateModel.findOne({
      _id: templateId,
      organizationId: new Types.ObjectId(organizationId),
    }).lean();
    if (!template) {
      throw new NotFoundException('Form template not found');
    }
    return template;
  }

  private async assertIndicatorExists(organizationId: string, indicatorId: string) {
    const exists = await this.indicatorModel.exists({
      _id: indicatorId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!exists) {
      throw new NotFoundException('Indicator not found');
    }
  }

  private async assertActivityExists(organizationId: string, activityId: string) {
    const exists = await this.activityModel.exists({
      _id: activityId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!exists) {
      throw new NotFoundException('Activity not found');
    }
  }

  private validateResponse(template: FormTemplate, answers: Record<string, unknown>) {
    const errors: string[] = [];
    for (const section of template.sections ?? []) {
      const questions = (section as { questions?: Array<Record<string, unknown>> }).questions ?? [];
      for (const question of questions) {
        const key = String(question.key ?? '');
        const label = String(question.label ?? key);
        const type = String(question.type ?? 'text');
        const required = Boolean(question.required);
        const value = answers[key];
        const hasValue = value !== undefined && value !== null && value !== '';

        if (required && !hasValue) {
          errors.push(`${label} is required`);
          continue;
        }
        if (!hasValue) continue;

        if (type === 'number' && typeof value !== 'number') {
          errors.push(`${label} must be a number`);
        }
        if (type === 'boolean' && typeof value !== 'boolean') {
          errors.push(`${label} must be true or false`);
        }
        if (['select', 'radio'].includes(type)) {
          const options = (question.options as string[] | undefined) ?? [];
          if (options.length > 0 && !options.includes(String(value))) {
            errors.push(`${label} must be one of: ${options.join(', ')}`);
          }
        }
        if (type === 'checkbox') {
          const options = (question.options as string[] | undefined) ?? [];
          const values = Array.isArray(value) ? value.map(String) : [String(value)];
          const invalid = values.filter((item) => options.length > 0 && !options.includes(item));
          if (invalid.length > 0) {
            errors.push(`${label} includes invalid option(s): ${invalid.join(', ')}`);
          }
        }
        const validation = (question.validation as { min?: number; max?: number; pattern?: string; patternMessage?: string } | undefined) ?? {};
        if (typeof value === 'number') {
          if (validation.min !== undefined && value < validation.min) errors.push(`${label} must be at least ${validation.min}`);
          if (validation.max !== undefined && value > validation.max) errors.push(`${label} must be at most ${validation.max}`);
        }
        if (validation.pattern && typeof value === 'string') {
          // The pattern is author-supplied and runs against every submission,
          // so a careless (or malicious) template could hang the request
          // thread through catastrophic backtracking. Bound both the pattern
          // and the input, and treat a bad pattern as a validation error
          // rather than a 500.
          if (validation.pattern.length > 200 || value.length > 4096) {
            errors.push(`${label} could not be validated (pattern or value too long)`);
          } else {
            try {
              const regex = new RegExp(validation.pattern);
              if (!regex.test(value)) {
                errors.push(validation.patternMessage ?? `${label} has an invalid format`);
              }
            } catch {
              errors.push(`${label} has a misconfigured validation pattern`);
            }
          }
        }
      }
    }
    if (errors.length > 0) {
      throw new BadRequestException({ message: 'Form response failed validation', errors });
    }
  }

  /**
   * Project cascade cleanup. FormResponse.projectId is a required field —
   * a response without a project violates its own schema, so responses
   * are deleted outright. FormTemplate.projectId is optional (a template
   * can be reused across projects), so templates are unscoped instead of
   * deleted — the template itself is still useful org-wide.
   */
  async cleanupForProject(organizationId: string, projectId: string) {
    const orgId = new Types.ObjectId(organizationId);
    const projId = new Types.ObjectId(projectId);

    const [responses, templates] = await Promise.all([
      this.responseModel.deleteMany({ organizationId: orgId, projectId: projId }),
      this.templateModel.updateMany(
        { organizationId: orgId, projectId: projId },
        { $unset: { projectId: 1 } },
      ),
    ]);

    return {
      responsesDeleted: responses.deletedCount,
      templatesUnscoped: templates.modifiedCount,
    };
  }
}