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

  list(organizationId: string, entityType?: string, entityId?: string) {
    const filter: Record<string, unknown> = { organizationId: new Types.ObjectId(organizationId) };
    if (entityType) filter.entityType = entityType;
    if (entityId) filter.entityId = entityId;
    return this.auditModel.find(filter).sort({ createdAt: -1 }).limit(250).lean();
  }
}
