import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { CreateFormResponseDto } from './dto/create-form-response.dto';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import { FormResponse } from './schemas/form-response.schema';
import { FormTemplate } from './schemas/form-template.schema';
import { Activity } from '../activities/schemas/activity.schema';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';

@Injectable()
export class FormsService {
  constructor(
    @InjectModel(FormTemplate.name) private readonly templateModel: Model<FormTemplate>,
    @InjectModel(FormResponse.name) private readonly responseModel: Model<FormResponse>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
  ) {}

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

    return this.responseModel.create({
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
          const regex = new RegExp(validation.pattern);
          if (!regex.test(value)) errors.push(validation.patternMessage ?? `${label} has an invalid format`);
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