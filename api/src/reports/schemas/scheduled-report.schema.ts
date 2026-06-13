import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type ScheduledReportDocument = HydratedDocument<ScheduledReport>;

export type ReportCadence = 'daily' | 'weekly' | 'monthly' | 'quarterly';

@Schema({ timestamps: true })
export class ScheduledReport {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ type: Types.ObjectId, ref: 'Project', required: true, index: true })
  projectId!: Types.ObjectId;

  /** Optional: pin to a specific reporting period; otherwise uses most recent approved. */
  @Prop({ type: Types.ObjectId, ref: 'ReportingPeriod' })
  reportingPeriodId?: Types.ObjectId;

  @Prop({ required: true })
  name!: string;

  /** Email recipients */
  @Prop({ type: [String], default: [] })
  recipients!: string[];

  @Prop({ type: String, enum: ['daily', 'weekly', 'monthly', 'quarterly'], default: 'monthly' })
  cadence!: ReportCadence;

  /** Day of month (1–28) for monthly/quarterly delivery */
  @Prop({ type: Number, default: 1 })
  dayOfMonth!: number;

  /** Include CSV attachment in email */
  @Prop({ type: Boolean, default: true })
  includeCsv!: boolean;

  @Prop({ type: Boolean, default: true })
  isActive!: boolean;

  @Prop({ type: Date })
  lastSentAt?: Date;

  @Prop({ type: Date })
  nextRunAt?: Date;

  @Prop({ type: Types.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;
}

export const ScheduledReportSchema = SchemaFactory.createForClass(ScheduledReport);
ScheduledReportSchema.index({ organizationId: 1, projectId: 1 });
ScheduledReportSchema.index({ nextRunAt: 1, isActive: 1 }); // for cron query