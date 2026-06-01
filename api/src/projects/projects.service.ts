import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { EntitlementsService } from '../organizations/entitlements.service';
import { NotificationsService } from '../notifications/notifications.service';
import { OrgRole } from '../common/constants/roles';
import { CreateProjectDto } from './dto/create-project.dto';
import { UpdateProjectDto } from './dto/update-project.dto';
import { Project } from './schemas/project.schema';

@Injectable()
export class ProjectsService {
  constructor(
    @InjectModel(Project.name) private readonly projectModel: Model<Project>,
    private readonly entitlements: EntitlementsService,
    private readonly notifications: NotificationsService,
  ) {}

  findAll(organizationId: string) {
    return this.projectModel
      .find({ organizationId: new Types.ObjectId(organizationId) })
      .sort({ createdAt: -1 })
      .lean();
  }

  async findOne(organizationId: string, id: string) {
    const project = await this.projectModel
      .findOne({
        _id: id,
        organizationId: new Types.ObjectId(organizationId),
      })
      .lean();
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async create(organizationId: string, dto: CreateProjectDto) {
    await this.entitlements.assertCanAddProject(organizationId);
    const project = await this.projectModel.create({
      organizationId: new Types.ObjectId(organizationId),
      name: dto.name,
      donor: dto.donor,
      description: dto.description,
      country: dto.country,
      region: dto.region,
      district: dto.district,
      geoPoint: this.geoPoint(dto.latitude, dto.longitude),
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
      status: dto.status ?? 'active',
    });

    await this.notifications.notifyRoles(
      organizationId,
      [OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER],
      {
        type: 'project.created',
        title: `Project created: ${project.name}`,
        message: `A new project was created and is ready for planning.`,
        entityType: 'project',
        entityId: project._id.toString(),
        link: `/projects/${project._id}`,
      },
    );

    return project;
  }

  async update(organizationId: string, id: string, dto: UpdateProjectDto) {
    const updateData: Record<string, unknown> = {
      ...dto,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      endDate: dto.endDate ? new Date(dto.endDate) : undefined,
    };
    const geoPoint = this.geoPoint(dto.latitude, dto.longitude);
    if (geoPoint) updateData.geoPoint = geoPoint;
    Object.keys(updateData).forEach((key) => updateData[key] === undefined && delete updateData[key]);
    const project = await this.projectModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        updateData,
        { new: true },
      )
      .lean();
    if (!project) {
      throw new NotFoundException('Project not found');
    }
    return project;
  }

  async remove(organizationId: string, id: string) {
    const result = await this.projectModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
    });
    if (result.deletedCount === 0) {
      throw new NotFoundException('Project not found');
    }
    return { deleted: true };
  }

  private geoPoint(latitude?: number, longitude?: number) {
    return latitude !== undefined && longitude !== undefined ? { latitude, longitude } : undefined;
  }
}
