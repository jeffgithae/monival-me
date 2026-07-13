import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { OrgRole } from '../common/constants/roles';
import { OrganizationMember } from '../members/schemas/organization-member.schema';
import { Notification } from './schemas/notification.schema';
import { MailerService } from '../mailer/mailer.service';
import { User } from '../users/schemas/user.schema';
import { ConfigService } from '@nestjs/config';

interface NotifyInput {
  organizationId: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  entityType?: string;
  entityId?: string;
  link?: string;
  /** Also deliver by email (no-op when the mailer isn't configured). */
  email?: boolean;
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    @InjectModel(Notification.name) private readonly notificationModel: Model<Notification>,
    @InjectModel(OrganizationMember.name)
    private readonly memberModel: Model<OrganizationMember>,
    @InjectModel(User.name) private readonly userModel: Model<User>,
    private readonly mailer: MailerService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Email a copy of an in-app notification. Fire-and-forget: email delivery
   * problems must never fail the action that triggered the notification.
   */
  private async emailUsers(userIds: string[], input: Pick<NotifyInput, 'title' | 'message' | 'link'>) {
    if (userIds.length === 0) return;
    if (!this.mailer.isConfigured) {
      // Visible in dev logs so it's obvious an email WOULD have gone out here.
      this.logger.log(`Email skipped (Resend not configured): ${input.title}`);
      return;
    }
    try {
      const users = await this.userModel
        .find({ _id: { $in: userIds.map((id) => new Types.ObjectId(id)) } })
        .select('email name')
        .lean();
      const appUrl = this.config.get('FRONTEND_URL', 'http://localhost:4200');
      const url = input.link ? `${appUrl}${input.link}` : appUrl;
      await Promise.all(users.map((u) => this.mailer.send({
        to: u.email,
        subject: input.title,
        html: `
          <p>Hi ${u.name ?? ''},</p>
          <p>${input.message}</p>
          <p><a href="${url}">Open in Evidara</a></p>
          <p style="color:#888;font-size:12px">You received this because of activity in your Evidara workspace.</p>
        `,
        text: `${input.message}\n\n${url}`,
      })));
    } catch {
      // logged inside mailer; never propagate
    }
  }

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

  async create(input: NotifyInput) {
    const doc = await this.notificationModel.create({
      organizationId: new Types.ObjectId(input.organizationId),
      userId: new Types.ObjectId(input.userId),
      type: input.type,
      title: input.title,
      message: input.message,
      entityType: input.entityType,
      entityId: input.entityId,
      link: input.link,
    });
    if (input.email) {
      void this.emailUsers([input.userId], input);
    }
    return doc;
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

    const { email, ...doc } = notification;
    const docs = await this.notificationModel.insertMany(
      userIds.map((userId) => ({
        organizationId: new Types.ObjectId(organizationId),
        userId: new Types.ObjectId(userId),
        ...doc,
      })),
    );
    if (email) {
      void this.emailUsers(userIds, notification);
    }
    return docs;
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
