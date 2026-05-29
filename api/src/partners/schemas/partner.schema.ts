import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type PartnerDocument = HydratedDocument<Partner>;

@Schema({ timestamps: true })
export class Partner {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  contactEmail?: string;

  @Prop({ trim: true })
  contactPhone?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  region?: string;

  @Prop({ trim: true })
  district?: string;

  @Prop({ type: { latitude: Number, longitude: Number }, _id: false })
  geoPoint?: { latitude: number; longitude: number };

  @Prop({ trim: true })
  notes?: string;
}

export const PartnerSchema = SchemaFactory.createForClass(Partner);
