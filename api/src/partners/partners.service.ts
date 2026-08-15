import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Partner } from './schemas/partner.schema';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { Activity } from '../activities/schemas/activity.schema';
import { Project } from '../projects/schemas/project.schema';
import { AuditService } from '../audit/audit.service';
import { escapeRegex } from '../common/utils/escape-regex';

@Injectable()
export class PartnersService {
  constructor(
    @InjectModel(Partner.name)  private readonly partnerModel: Model<Partner>,
    @InjectModel(Activity.name) private readonly activityModel: Model<Activity>,
    @InjectModel(Project.name)  private readonly projectModel: Model<Project>,
    private readonly audit: AuditService,
  ) {}

  // ─── Core CRUD ──────────────────────────────────────────────────────────────

  list(organizationId: string, filters?: { search?: string; country?: string }) {
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (filters?.country) {
      filter.country = filters.country;
    }
    if (filters?.search) {
      const rx = new RegExp(escapeRegex(filters.search), 'i');
      filter.$or = [{ name: rx }, { contactEmail: rx }, { district: rx }, { region: rx }];
    }
    return this.partnerModel.find(filter).sort({ name: 1 }).lean();
  }

  async findOne(organizationId: string, id: string) {
    const partner = await this.partnerModel
      .findOne({ _id: id, organizationId: new Types.ObjectId(organizationId) })
      .lean();
    if (!partner) throw new NotFoundException('Partner not found');
    return partner;
  }

  async create(organizationId: string, dto: CreatePartnerDto, actorUserId?: string) {
    const partner = await this.partnerModel.create({
      organizationId: new Types.ObjectId(organizationId),
      ...dto,
      geoPoint: this.geoPoint(dto.latitude, dto.longitude),
    });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'partner.created',
      entityType: 'partner',
      entityId: partner._id.toString(),
      metadata: { name: partner.name },
    });

    return partner;
  }

  async update(
    organizationId: string,
    id: string,
    dto: UpdatePartnerDto,
    actorUserId?: string,
  ) {
    const before = await this.findOne(organizationId, id);

    // `latitude`/`longitude` are flattened into `geoPoint` on write, so only
    // rebuild the point when the caller actually supplied a coordinate —
    // otherwise a partial update would silently erase an existing location.
    const { latitude, longitude, ...rest } = dto;
    const update: Record<string, unknown> = { ...rest };
    if (latitude !== undefined || longitude !== undefined) {
      const existing = await this.partnerModel.findById(id).lean();
      update.geoPoint = this.geoPoint(
        latitude ?? existing?.geoPoint?.latitude,
        longitude ?? existing?.geoPoint?.longitude,
      );
    }

    const partner = await this.partnerModel
      .findOneAndUpdate(
        { _id: id, organizationId: new Types.ObjectId(organizationId) },
        update,
        { new: true },
      )
      .lean();

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'partner.updated',
      entityType: 'partner',
      entityId: id,
      before,
      after: partner,
      metadata: { fields: Object.keys(update) },
    });

    return partner;
  }

  async remove(organizationId: string, id: string, actorUserId?: string) {
    const partner = await this.findOne(organizationId, id);
    const orgId = new Types.ObjectId(organizationId);

    // Partners are referenced by activities (`partnerId`) and projects
    // (`partnerIds`). Deleting one out from under those records would leave
    // dangling references that surface as blanks in donor reports, so block
    // the delete and make the caller reassign first.
    const [linkedActivities, linkedProjects] = await Promise.all([
      this.activityModel.countDocuments({ organizationId: orgId, partnerId: new Types.ObjectId(id) }),
      this.projectModel.countDocuments({ organizationId: orgId, partnerIds: new Types.ObjectId(id) }),
    ]);

    if (linkedActivities > 0 || linkedProjects > 0) {
      const parts: string[] = [];
      if (linkedProjects > 0) parts.push(`${linkedProjects} project(s)`);
      if (linkedActivities > 0) parts.push(`${linkedActivities} activity/activities`);
      throw new BadRequestException(
        `Cannot delete partner "${partner.name}" — still linked to ${parts.join(' and ')}. ` +
        `Reassign or remove those references first.`,
      );
    }

    await this.partnerModel.deleteOne({ _id: id, organizationId: orgId });

    await this.audit.record({
      organizationId,
      actorUserId,
      action: 'partner.deleted',
      entityType: 'partner',
      entityId: id,
      before: partner,
      metadata: { name: partner.name },
    });

    return { deleted: true, id };
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private geoPoint(latitude?: number, longitude?: number) {
    return latitude !== undefined && longitude !== undefined
      ? { latitude, longitude }
      : undefined;
  }
}
