import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types } from 'mongoose';

export type DonorDocument = HydratedDocument<Donor>;

export enum DonorType {
  BILATERAL    = 'bilateral',
  MULTILATERAL = 'multilateral',
  FOUNDATION   = 'foundation',
  CORPORATE    = 'corporate',
  INDIVIDUAL   = 'individual',
  GOVERNMENT   = 'government',
  OTHER        = 'other',
}

export enum DonorStatus {
  PROSPECT = 'prospect',
  ACTIVE   = 'active',
  INACTIVE = 'inactive',
  FORMER   = 'former',
}

@Schema({ _id: false })
export class DonorAddress {
  @Prop({ trim: true }) street?: string;
  @Prop({ trim: true }) city?: string;
  @Prop({ trim: true }) state?: string;
  @Prop({ trim: true }) postalCode?: string;
  @Prop({ trim: true }) country?: string;
}

@Schema({ _id: false })
export class DonorContact {
  @Prop({ required: true, trim: true }) name!: string;
  @Prop({ trim: true })                 title?: string;
  @Prop({ trim: true })                 email?: string;
  @Prop({ trim: true })                 phone?: string;
  @Prop({ default: false })             isPrimary!: boolean;
}

@Schema({ _id: true, timestamps: true })
export class DonorEngagement {
  @Prop({ type: String, enum: ['call','email','meeting','site_visit','proposal_submission','report_submission','other'], required: true })
  type!: string;

  @Prop({ required: true }) date!: Date;
  @Prop({ required: true, trim: true }) summary!: string;
  @Prop({ trim: true }) outcome?: string;
  @Prop({ type: Types.ObjectId, ref: 'User' }) recordedBy?: Types.ObjectId;
  @Prop({ type: Types.ObjectId, ref: 'Grant' }) relatedGrantId?: Types.ObjectId;
}

@Schema({ _id: true })
export class ComplianceCondition {
  @Prop({ required: true, trim: true }) description!: string;
  @Prop({ type: String, enum: ['pending','met','waived','overdue'], default: 'pending' }) status!: string;
  @Prop() dueDate?: Date;
  @Prop() metDate?: Date;
  @Prop({ trim: true }) notes?: string;
}

@Schema({ timestamps: true })
export class Donor {
  @Prop({ type: Types.ObjectId, ref: 'Organization', required: true, index: true })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  shortName?: string;

  @Prop({ type: String, enum: DonorType, default: DonorType.OTHER })
  type!: string;

  @Prop({ type: String, enum: DonorStatus, default: DonorStatus.ACTIVE, index: true })
  status!: string;

  @Prop({ type: DonorAddress, _id: false })
  address?: DonorAddress;

  /** Legacy single-contact fields kept for backwards compat */
  @Prop({ trim: true }) contactName?: string;
  @Prop({ trim: true }) contactEmail?: string;
  @Prop({ trim: true }) contactPhone?: string;

  /** Rich multi-contact list */
  @Prop({ type: [DonorContact], _id: false, default: [] })
  contacts!: DonorContact[];

  @Prop({ trim: true }) website?: string;
  @Prop({ trim: true }) description?: string;
  @Prop({ trim: true }) notes?: string;

  /** M&E / reporting requirements */
  @Prop({ trim: true })                                                          preferredReportingFormat?: string;
  @Prop({ default: false })                                                      requiresDisaggregation!: boolean;
  @Prop({ type: String, enum: ['monthly','quarterly','semiannual','annual'], default: 'quarterly' }) reportingCadence?: string;
  @Prop({ type: [String], default: [] })                                         requiredDisaggregationDimensions!: string[];

  /** Financial relationship */
  @Prop({ default: 'USD', trim: true }) currency?: string;
  @Prop({ type: Number, min: 1, max: 12 }) fiscalYearEnd?: number; // month 1–12

  /** Agreement metadata */
  @Prop() signedAgreementDate?: Date;
  @Prop({ trim: true }) agreementReferenceNumber?: string;

  /** Compliance conditions that apply at the donor level (across all grants) */
  @Prop({ type: [ComplianceCondition], default: [] })
  complianceConditions!: ComplianceCondition[];

  /** Communication / engagement log */
  @Prop({ type: [DonorEngagement], default: [] })
  engagements!: DonorEngagement[];

  /** Flexible tagging for filtering */
  @Prop({ type: [String], default: [] })
  tags!: string[];
}

export const DonorSchema = SchemaFactory.createForClass(Donor);
DonorSchema.index({ organizationId: 1, name: 1 });
DonorSchema.index({ organizationId: 1, status: 1 });
DonorSchema.index({ organizationId: 1, type: 1 });
DonorSchema.index({ organizationId: 1, tags: 1 });