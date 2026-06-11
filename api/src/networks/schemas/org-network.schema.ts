import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type OrgNetworkDocument = HydratedDocument<OrgNetwork>;

export type NetworkMemberRole = 'lead' | 'implementing' | 'observer';
export type InviteStatus = 'pending' | 'accepted' | 'declined' | 'revoked';

@Schema({ _id: true, timestamps: false })
export class NetworkMember {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, enum: ['lead', 'implementing', 'observer'], default: 'implementing' })
  role!: NetworkMemberRole;

  @Prop({ required: true, enum: ['pending', 'accepted', 'declined', 'revoked'], default: 'pending' })
  status!: InviteStatus;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  invitedByUserId?: Types.ObjectId;

  @Prop()
  invitedAt?: Date;

  @Prop()
  acceptedAt?: Date;

  /** Optional label, e.g. "East Africa region" */
  @Prop()
  label?: string;

  /** Which indicator codes this partner shares with the hub */
  @Prop({ type: [String], default: [] })
  sharedIndicatorCodes!: string[];
}

@Schema({ timestamps: true })
export class OrgNetwork {
  /** The hub / lead organisation that owns this network */
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  hubOrganizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: [NetworkMember], default: [] })
  members!: NetworkMember[];

  @Prop({ default: true })
  isActive!: boolean;
}

export const OrgNetworkSchema = SchemaFactory.createForClass(OrgNetwork);
OrgNetworkSchema.index({ hubOrganizationId: 1 });
OrgNetworkSchema.index({ 'members.organizationId': 1 });