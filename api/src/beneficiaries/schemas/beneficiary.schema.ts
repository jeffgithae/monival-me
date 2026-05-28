import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type BeneficiaryDocument = HydratedDocument<Beneficiary>;

@Schema({ timestamps: true })
export class Beneficiary {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  groupType?: string; // e.g., household, individual, community

  @Prop({ trim: true })
  location?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const BeneficiarySchema = SchemaFactory.createForClass(Beneficiary);
