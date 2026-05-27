import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DonorDocument = HydratedDocument<Donor>;

@Schema({ timestamps: true })
export class Donor {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  notes?: string;
}

export const DonorSchema = SchemaFactory.createForClass(Donor);
