import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Indicator } from '../indicators/schemas/indicator.schema';
import { Project } from '../projects/schemas/project.schema';
import { Partner } from '../partners/schemas/partner.schema';
import { Beneficiary } from '../beneficiaries/schemas/beneficiary.schema';
import { OrgRole } from '../common/constants/roles';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateActivityDto } from './dto/create-activity.dto';
import { CreateActivityTemplateDto } from './dto/create-activity-template.dto';
import { UpdateActivityDto } from './dto/update-activity.dto';
import { Activity } from './schemas/activity.schema';
import { ActivityTemplate } from './schemas/activity-template.schema';

@Injectable()
export class ActivitiesService {
  constructor(
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(ActivityTemplate.name)
    private readonly activityTemplateModel: Model<ActivityTemplate>,
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    @InjectModel(Indicator.name) private readonly indicatorModel: Model<Indicator>,
    @InjectModel(Partner.name) private readonly partnerModel: Model<Partner>,
    @InjectModel(Beneficiary.name) private readonly beneficiaryModel: Model<Beneficiary>,
    private readonly notifications: NotificationsService,
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

  findTemplates(organizationId: string, projectId?: string) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (projectId) {
      filter.projectId = new Types.ObjectId(projectId);
    }
    return this.activityTemplateModel.find(filter).sort({ name: 1 }).lean();
  }

  async createTemplate(
    organizationId: string,
    dto: CreateActivityTemplateDto,
  ) {
    await this.assertRefs(organizationId, dto.projectId, dto.indicatorId);
    return this.activityTemplateModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      name: dto.name,
      description: dto.description,
      indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      defaultLocation: dto.defaultLocation,
      defaultActivityType: dto.defaultActivityType,
      defaultEvidenceUrl: dto.defaultEvidenceUrl,
      defaultParticipants: dto.defaultParticipants ?? 0,
      defaultQuantity: dto.defaultQuantity ?? 0,
      defaultNotes: dto.defaultNotes,
    });
  }

  async removeTemplate(organizationId: string, id: string) {
    const result = await this.activityTemplateModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Activity template not found');
    }
    return { deleted: true };
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
    if (dto.partnerId) {
      const partner = await this.partnerModel.findOne({ _id: dto.partnerId, organizationId: new Types.ObjectId(organizationId) });
      if (!partner) throw new NotFoundException('Partner not found');
    }
    if (dto.beneficiaryIds && dto.beneficiaryIds.length > 0) {
      const count = await this.beneficiaryModel.countDocuments({ _id: { $in: dto.beneficiaryIds }, organizationId: new Types.ObjectId(organizationId) });
      if (count !== dto.beneficiaryIds.length) throw new NotFoundException('One or more beneficiaries not found');
    }
    const shouldRequireApproval = role === OrgRole.FIELD_OFFICER;
    let status: 'draft' | 'submitted' | 'approved' = 'approved';

    if (dto.status === 'draft') {
      status = 'draft';
    } else if (dto.status === 'submitted' || shouldRequireApproval) {
      status = 'submitted';
    }

    const activity = await this.activityModel.create({
      organizationId: new Types.ObjectId(organizationId),
      projectId: new Types.ObjectId(dto.projectId),
      indicatorId: dto.indicatorId ? new Types.ObjectId(dto.indicatorId) : undefined,
      partnerId: dto.partnerId ? new Types.ObjectId(dto.partnerId) : undefined,
      beneficiaryIds: dto.beneficiaryIds ? dto.beneficiaryIds.map((b) => new Types.ObjectId(b)) : undefined,
      title: dto.title,
      description: dto.description,
      activityDate: new Date(dto.activityDate),
      location: dto.location,
      country: dto.country,
      region: dto.region,
      district: dto.district,
      geoPoint: this.geoPoint(dto.latitude, dto.longitude),
      activityType: dto.activityType,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
      participants: dto.participants ?? 0,
      quantity: dto.quantity ?? 0,
      notes: dto.notes,
      evidenceUrl: dto.evidenceUrl,
      evidenceNotes: dto.evidenceNotes,
      status,
      submittedByUserId: new Types.ObjectId(userId),
    });

    if (status === 'submitted') {
      await this.notifications.notifyRoles(
        organizationId,
        [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
        {
          type: 'activity.submitted',
          title: `Activity submitted: ${activity.title}`,
          message: `An activity has been submitted for review. Please review and approve or reject it.`,
          entityType: 'activity',
          entityId: activity._id.toString(),
          link: `/activities/${activity._id}`,
        },
        userId,
      );
    }

    return activity;
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

    if (activity.submittedByUserId) {
      await this.notifications.create({
        organizationId,
        userId: activity.submittedByUserId.toString(),
        type: `activity.${status}`,
        title: `Activity ${status}: ${activity.title}`,
        message: `Your activity has been ${status}.`,
        entityType: 'activity',
        entityId: activity._id.toString(),
        link: `/activities/${activity._id}`,
      });
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

    const updateDoc: Record<string, unknown> = {
      ...dto,
      indicatorId: dto.indicatorId
        ? new Types.ObjectId(dto.indicatorId)
        : undefined,
      activityDate: dto.activityDate ? new Date(dto.activityDate) : undefined,
      templateId: dto.templateId ? new Types.ObjectId(dto.templateId) : undefined,
      partnerId: dto.partnerId ? new Types.ObjectId(dto.partnerId) : undefined,
      beneficiaryIds: dto.beneficiaryIds ? dto.beneficiaryIds.map((b) => new Types.ObjectId(b)) : undefined,
      geoPoint: this.geoPoint(dto.latitude, dto.longitude),
    };

    const activity = await this.activityModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        updateDoc,
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

  private geoPoint(latitude?: number, longitude?: number) {
    return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  }
}
