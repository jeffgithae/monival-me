import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { AuditEvent } from './schemas/audit-event.schema';

@Injectable()
export class AuditService {
  constructor(@InjectModel(AuditEvent.name) private readonly auditModel: Model<AuditEvent>) {}

  record(data: {
    organizationId: string;
    actorUserId?: string;
    action: string;
    entityType: string;
    entityId?: string;
    metadata?: unknown;
  }) {
    return this.auditModel.create({
      organizationId: new Types.ObjectId(data.organizationId),
      actorUserId: data.actorUserId ? new Types.ObjectId(data.actorUserId) : undefined,
      action: data.action,
      entityType: data.entityType,
      entityId: data.entityId,
      metadata: data.metadata,
    });
  }

  async list(
    organizationId: string,
    opts: {
      entityType?: string;
      entityId?: string;
      action?: string;
      userEmail?: string;
      page?: number;
      limit?: number;
    } = {},
  ) {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (opts.entityType) filter.entityType = opts.entityType;
    if (opts.entityId) filter.entityId = opts.entityId;
    // Stored actions are snake_case like `create_project`; the UI filters send
    // a bare verb (CREATE, APPROVE, …) so match it as a case-insensitive prefix.
    if (opts.action) filter.action = new RegExp('^' + escape(opts.action), 'i');
    if (opts.userEmail) {
      const users = await this.auditModel.db
        .model('User')
        .find({ email: new RegExp(escape(opts.userEmail), 'i') }, { _id: 1 })
        .lean();
      filter.actorUserId = { $in: users.map((u) => u._id) };
    }

    const page = Math.max(1, Number(opts.page) || 1);
    const limit = Math.min(200, Math.max(1, Number(opts.limit) || 50));

    const [rows, total] = await Promise.all([
      this.auditModel
        .find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate('actorUserId', 'email name')
        .lean(),
      this.auditModel.countDocuments(filter),
    ]);

    const data = rows.map((e: any) => ({
      ...e,
      entity: e.entityType,
      userEmail: e.actorUserId?.email ?? '',
      actorUserId: e.actorUserId?._id ?? e.actorUserId,
    }));
    return { data, total };
  }
}
