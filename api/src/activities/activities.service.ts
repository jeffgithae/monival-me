import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { OrgRole } from '../common/constants/roles';
import { CreateActivityDto } from './dto/create-activity.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Activity } from './schemas/activity.schema';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
  ) {}

  private async assertRefs(
    organizationId: string,
    projectId: string,
    indicatorId?: string,
  ) {
    const project = await this.projectModel.findOne({
      _id: projectId,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    if (indicatorId) {
      const indicator = await this.indicatorModel.findOne({
        _id: indicatorId,
        projectId: new Types.ObjectId(projectId),
        organizationId: new Types.ObjectId(organizationId),
      });
      if (!indicator) {
        throw new NotFoundException('Indicator not found');
      }
    }
  }

  findAll(organizationId: string, projectId?: string) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    return this.activityModel.find(filter).sort({ activityDate: -1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const activity = await this.activityModel
      .findOne({
        _id: id,
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean();
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async create(
    organizationId: string,
    dto: CreateActivityDto,
    role: OrgRole,
    userId: string,
  ) {
    await this.assertRefs(organizationId, dto.projectId, dto.indicatorId);
    const shouldRequireApproval = role === OrgRole.FIELD_OFFICER;
    let status: 'draft' | 'submitted' | 'approved' = 'approved';

    if (dto.status === 'draft') {
      status = 'draft';
    } else if (dto.status === 'submitted' || shouldRequireApproval) {
      status = 'submitted';
    }

    return this.activityModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      title: dto.title,
      description: dto.description,
      activityDate: new Date(dto.activityDate),
      location: dto.location,
      participants: dto.participants ?? 0,
      quantity: dto.quantity ?? 0,
      notes: dto.notes,
      status,
      submittedByUserId: new Types.ObjectId(userId),
    });
  }

  async review(
    organizationId: string,
    id: string,
    reviewerId: string,
    status: 'approved' | 'rejected',
  ) {
    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          status,
          reviewedByUserId: new Types.ObjectId(reviewerId),
          reviewedAt: new Date(),
        },
        { new: true },
      )
      .lean();
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async update(organizationId: string, id: string, dto: UpdateActivityDto) {
    if (dto.indicatorId) {
      const existing = await this.activityModel.findOne({
        _id: id,
        organizationId: new Types.ObjectId(organizationId),
      });
      if (!existing) {
        throw new NotFoundException('Activity not found');
      }
      await this.assertRefs(
        organizationId,
        existing.projectId.toString(),
        dto.indicatorId,
      );
    }

    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        {
          ...dto,
          indicatorId: dto.indicatorId
            ? new Types.ObjectId(dto.indicatorId)
            : undefined,
          activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
        },
        { new: true },
      )
      .lean();
    if (!activity) {
      throw new NotFoundException('Activity not found');
    }
    return activity;
  }

  async remove(organizationId: string, id: string) {
    const result = await this.activityModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Activity not found');
    }
    return { deleted: true };
  }
}
