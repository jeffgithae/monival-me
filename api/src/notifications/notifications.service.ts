import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrgRole } from '../common/constants/roles';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { Notification } from './schemas/notification.schema';

interface NotifyInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  link?: string;
}

@Injectable()
export class NotificationsService {
  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
  ) {}

  async list(
    organizationId: string,
    userId: string,
    query: { isRead?: string; page?: string; limit?: string },
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(50, Math.max(1, Number(query.limit ?? 10)));
    const filter: Record<string, unknown> = {
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
    };
    if (query.isRead !== undefined) {
      filter.isRead = query.isRead === 'true';
    }

    const [data, total, unreadCount] = await Promise.all([
      this.notificationModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      this.notificationModel.countDocuments(filter),
      this.notificationModel.countDocuments({
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
        isRead: false,
      }),
    ]);

    return { data, total, unreadCount };
  }

  create(input: NotifyInput) {
    return this.notificationModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
    });
  }

  async notifyRoles(
    organizationId: string,
    roles: OrgRole[],
    notification: Omit<NotifyInput, 'organizationId' | 'userId'>,
    excludeUserId?: string,
  ) {
    const members = await this.memberModel
      .find({
        organizationId: new Types.ObjectId(organizationId),
        role: { $in: roles },
        status: 'active',
      })
      .lean();
    const userIds = [
      ...new Set(
        members
          .map((member) => member.userId.toString())
          .filter((userId) => userId !== excludeUserId),
      ),
    ];

    if (userIds.length === 0) {
      return [];
    }

    return this.notificationModel.insertMany(
      userIds.map((userId) => ({
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
        ...notification,
      })),
    );
  }

  markRead(organizationId: string, userId: string, id: string) {
    return this.notificationModel.findOneAndUpdate(
      {
        _id: id,
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
      },
      { isRead: true, readAt: new Date() },
      { new: true },
    );
  }

  markAllRead(organizationId: string, userId: string) {
    return this.notificationModel.updateMany(
      {
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
        isRead: false,
      },
      { isRead: true, readAt: new Date() },
    );
  }

  delete(organizationId: string, userId: string, id: string) {
    return this.notificationModel.deleteOne({
      _id: id,
      organizationId: new Types.ObjectId(organizationId),
      userId: new Types.ObjectId(userId),
    });
  }
}
