import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ProjectDocument = HydratedDocument<Project>;

@Schema({ timestamps: true })
export class Project {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  donor?: string;

  @Prop({ type: Types.ObjectId, ref: 'Donor' })
  donorId?: Types.ObjectId;

  @Prop({ trim: true })
  description?: string;

  @Prop({ trim: true })
  country?: string;

  @Prop({ trim: true })
  region?: string;

  @Prop({ trim: true })
  district?: string;

  @Prop({ type: { latitude: Number, longitude: Number }, _id: false })
  geoPoint?: { latitude: number; longitude: number };

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: 'active', enum: ['active', 'completed', 'paused'] })
  status!: string;

  @Prop({ default: 'not_started', enum: ['not_started', 'in_progress', 'completed'] })
  evaluationStatus!: string;

  @Prop({ trim: true })
  evaluationSummary?: string;

  @Prop({ trim: true })
  lessonsLearned?: string;

  @Prop()
  nextReviewDate?: Date;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
