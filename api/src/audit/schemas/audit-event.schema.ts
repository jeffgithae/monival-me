import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, SchemaTypes, Types } from 'mongoose';

export type AuditEventDocument = HydratedDocument<AuditEvent>;

@Schema({ timestamps: true })
export class AuditEvent {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', index: true })
  actorUserId?: Types.ObjectId;

  @Prop({ required: true, trim: true, index: true })
  action!: string;

  @Prop({ required: true, trim: true, index: true })
  entityType!: string;

  @Prop({ trim: true, index: true })
  entityId?: string;

  @Prop({ type: SchemaTypes.Mixed })
  metadata?: unknown;
}

export const AuditEventSchema = SchemaFactory.createForClass(AuditEvent);
AuditEventSchema.index({ organizationId: 1, createdAt: -1 });
AuditEventSchema.index({ createdAt: 1 }, {
  expireAfterSeconds: 180 * 24 * 60 * 60, // 180 days TTL (enterprise can extend)
  name: 'audit_ttl',
});