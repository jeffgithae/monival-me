import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';
import { OrgRole } from '../../common/constants/roles';

export type OrganizationMemberDocument = HydratedDocument<OrganizationMember>;

@Schema({ timestamps: true })
export class OrganizationMember {
  @Prop({ type: SchemaTypes.ObjectId, ref: 'User', required: true, index: true })
  userId!: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: String, enum: Object.values(OrgRole), required: true })
  role!: OrgRole;

  @Prop({ type: String, default: 'active', enum: ['active', 'invited', 'disabled'] })
  status!: string;

  @Prop()
  invitedAt?: Date;

  @Prop()
  joinedAt?: Date;

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Project', default: [] })
  projectScopeIds!: Types.ObjectId[];

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Partner', default: [] })
  partnerScopeIds!: Types.ObjectId[];
}

export const OrganizationMemberSchema = SchemaFactory.createForClass(OrganizationMember);
OrganizationMemberSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
