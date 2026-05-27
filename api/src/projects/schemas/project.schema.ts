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

  @Prop()
  startDate?: Date;

  @Prop()
  endDate?: Date;

  @Prop({ default: 'active', enum: ['active', 'completed', 'paused'] })
  status!: string;
}

export const ProjectSchema = SchemaFactory.createForClass(Project);
