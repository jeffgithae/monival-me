import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';
import { OrgRole } from '../../common/constants/roles';

export type InviteDocument = HydratedDocument<Invite>;

@Schema({ timestamps: true })
export class Invite {
  @Prop({ required: true, lowercase: true, trim: true })
  email!: string;

  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  invitedByUserId!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(OrgRole), required: true })
  role!: OrgRole;

  @Prop({ required: true, unique: true })
  token!: string;

  @Prop({ required: true })
  expiresAt!: Date;

  @Prop()
  acceptedAt?: Date;
}

export const InviteSchema = SchemaFactory.createForClass(Invite);

// ─── Indexes ──────────────────────────────────────────────────────────────────
InviteSchema.index({ organizationId: 1, status: 1 });
InviteSchema.index({ token: 1 }, { unique: true, sparse: true });