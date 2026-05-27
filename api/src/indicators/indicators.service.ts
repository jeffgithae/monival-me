import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Project } from '../projects/schemas/project.schema';
import { CreateIndicatorDto } from './dto/create-indicator.dto';
import { UpdateIndicatorDto } from './dto/update-indicator.dto';
import { EntitlementsService } from '../organizations/entitlements.service';
import { Indicator } from './schemas/indicator.schema';

@Injectable()
export class IndicatorsService {
  constructor(
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    private readonly entitlements: EntitlementsService,
  ) {}

  private async assertProject(organizationId: string, projectId: string) {
    const project = await this.projectModel.findOne({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
  }

  async findAll(organizationId: string, projectId?: string) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    return this.indicatorModel.find(filter).sort({ code: 1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const indicator = await this.indicatorModel
      .findOne({
        _id: id,
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean();
    if (!indicator) {
      throw new NotFoundException('Indicator not found');
    }
    return indicator;
  }

  async create(organizationId: string, dto: CreateIndicatorDto) {
    await this.assertProject(organizationId, dto.projectId);
    await this.entitlements.assertCanAddIndicator(organizationId, dto.projectId);
    return this.indicatorModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      parentId: dto.parentId ? new Types.ObjectId(dto.parentId) : undefined,
      level: dto.level ?? 'output',
      code: dto.code,
      title: dto.title,
      unit: dto.unit,
      meansOfVerification: dto.meansOfVerification,
      assumptions: dto.assumptions,
      disaggregation: dto.disaggregation ?? [],
      baseline: dto.baseline ?? 0,
      target: dto.target,
      frequency: dto.frequency ?? 'quarterly',
    });
  }

  async update(organizationId: string, id: string, dto: UpdateIndicatorDto) {
    const indicator = await this.indicatorModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        dto,
        { new: true },
      )
      .lean();
    if (!indicator) {
      throw new NotFoundException('Indicator not found');
    }
    return indicator;
  }

  async remove(organizationId: string, id: string) {
    const result = await this.indicatorModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Indicator not found');
    }
    return { deleted: true };
  }
}
