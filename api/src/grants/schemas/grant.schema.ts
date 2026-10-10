import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Types, SchemaTypes } from 'mongoose';

export type GrantDocument = HydratedDocument<Grant>;

export const REPORT_TYPES = ['narrative', 'financial', 'interim', 'final', 'audit'] as const;
export const REPORT_STATUSES = ['pending', 'submitted', 'accepted', 'overdue', 'waived'] as const;
export const AMENDMENT_TYPES = [
  'no_cost_extension',
  'budget_revision',
  'scope_change',
  'termination',
] as const;

/**
 * A tranche of money actually received from the donor.
 *
 * Distinct from `amount` (what was awarded) and `amountSpent` (what has been
 * expended). Without this, "disbursed" cannot be reported at all — which was
 * the original bug: donor summaries read a `disbursedAmount` field that never
 * existed, so the figure was permanently zero.
 */
@Schema({ _id: true, timestamps: false })
export class GrantDisbursement {
  @Prop({ required: true }) plannedDate!: Date;
  @Prop() receivedDate?: Date;

  @Prop({ required: true, type: Number, min: 0 }) amount!: number;

  /** Currency of this tranche; defaults to the grant currency when omitted. */
  @Prop({ trim: true, uppercase: true }) currency?: string;

  @Prop({
    type: String,
    enum: ['scheduled', 'received', 'delayed', 'cancelled'],
    default: 'scheduled',
  })
  status!: string;

  /** Donor payment reference / transfer ID, for reconciliation. */
  @Prop({ trim: true }) reference?: string;

  @Prop({ trim: true }) notes?: string;
}
export const GrantDisbursementSchema = SchemaFactory.createForClass(GrantDisbursement);

/**
 * A single donor reporting obligation with a real due date.
 *
 * Replaces the `requiresMonthlyReporting` / `requiresFinalReport` booleans as
 * the source of truth for deadlines. The booleans are retained for backwards
 * compatibility and are used to generate a default schedule.
 */
@Schema({ _id: true, timestamps: false })
export class GrantReportingObligation {
  @Prop({ required: true }) dueDate!: Date;

  @Prop({ type: String, enum: REPORT_TYPES, default: 'narrative' })
  type!: string;

  @Prop({ type: String, enum: REPORT_STATUSES, default: 'pending' })
  status!: string;

  @Prop() submittedDate?: Date;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'ReportingPeriod' })
  reportingPeriodId?: Types.ObjectId;

  @Prop({ trim: true }) notes?: string;
}
export const GrantReportingObligationSchema =
  SchemaFactory.createForClass(GrantReportingObligation);

/**
 * An approved change to the award. Amendments are append-only: the grant's
 * live `amount`/`endDate` are updated alongside, and this is the audit record
 * of what those values used to be and why they changed.
 */
@Schema({ _id: true, timestamps: false })
export class GrantAmendment {
  @Prop({ required: true }) effectiveDate!: Date;

  @Prop({ type: String, enum: AMENDMENT_TYPES, required: true })
  type!: string;

  @Prop({ type: Number }) previousAmount?: number;
  @Prop({ type: Number }) newAmount?: number;
  @Prop() previousEndDate?: Date;
  @Prop() newEndDate?: Date;

  @Prop({ required: true, trim: true }) reason!: string;

  @Prop({ trim: true }) donorReference?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' }) recordedBy?: Types.ObjectId;
  @Prop({ default: () => new Date() }) recordedAt!: Date;
}
export const GrantAmendmentSchema = SchemaFactory.createForClass(GrantAmendment);

/** Match / co-financing the organisation committed to alongside the award. */
@Schema({ _id: false })
export class GrantMatchFunding {
  @Prop({ default: false }) required!: boolean;
  @Prop({ type: Number, min: 0, default: 0 }) requiredAmount!: number;
  @Prop({ type: Number, min: 0, default: 0 }) securedAmount!: number;
  @Prop({ trim: true }) source?: string;
  @Prop({ trim: true }) notes?: string;
}
export const GrantMatchFundingSchema = SchemaFactory.createForClass(GrantMatchFunding);

@Schema({ timestamps: true })
export class Grant {
  @Prop({ type: SchemaTypes.ObjectId, required: true, ref: 'Organization' })
  organizationId!: Types.ObjectId;

  @Prop({ required: true, trim: true })
  name!: string;

  @Prop({ trim: true })
  description?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Donor' })
  donorId?: Types.ObjectId;

  // ─── Award hierarchy ────────────────────────────────────────────────────────

  /**
   * Set on a sub-award to point at the prime award it is carved out of.
   * Prime awards leave this null. One level is enforced in the service: a
   * sub-award cannot itself be a parent.
   */
  @Prop({ type: SchemaTypes.ObjectId, ref: 'Grant', default: null })
  parentGrantId?: Types.ObjectId | null;

  /** Name of the partner organisation holding a sub-award. */
  @Prop({ trim: true })
  subRecipientName?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'Partner' })
  subRecipientPartnerId?: Types.ObjectId;

  // ─── Money ──────────────────────────────────────────────────────────────────

  @Prop({ required: true, type: Number, min: 0 })
  amount!: number;

  @Prop({ default: 'USD', trim: true, uppercase: true })
  currency!: string;

  /**
   * Units of the organisation's base currency per one unit of `currency`,
   * captured when the award was recorded. Totals convert through this so a
   * historical award is not restated every time the market moves. Null means
   * "look up the current rate".
   */
  @Prop({ type: Number, min: 0, default: null })
  exchangeRate?: number | null;

  @Prop({ default: 0, type: Number, min: 0 })
  amountSpent!: number;

  /**
   * True when approved expenditure has passed the awarded amount. Set by the
   * spend sync rather than rejecting the write, so an overspend is surfaced
   * instead of being silently discarded.
   */
  @Prop({ default: false })
  isOverspent!: boolean;

  @Prop({ type: Number, default: 0 })
  overspendAmount!: number;

  /** Percentage added for indirect / overhead recovery (e.g. 12.5 for 12.5%). */
  @Prop({ type: Number, min: 0, max: 100, default: 0 })
  indirectCostRate!: number;

  /**
   * Restricted funds may only be spent on the awarded purpose; unrestricted
   * may be applied at the organisation's discretion. Donor reporting and
   * audit treat the two differently.
   */
  @Prop({ type: String, enum: ['restricted', 'unrestricted'], default: 'restricted' })
  fundClassification!: string;

  @Prop({ type: GrantMatchFundingSchema, default: () => ({}) })
  matchFunding!: GrantMatchFunding;

  // ─── Lifecycle ──────────────────────────────────────────────────────────────

  @Prop({
    type: String,
    enum: ['prospect', 'applied', 'awarded', 'pending', 'active', 'completed', 'closed', 'rejected'],
    default: 'active',
  })
  status!: string;

  @Prop({ required: true })
  startDate!: Date;

  @Prop({ required: true })
  endDate!: Date;

  @Prop({ type: [GrantAmendmentSchema], default: [] })
  amendments!: GrantAmendment[];

  // ─── Delivery & obligations ─────────────────────────────────────────────────

  @Prop({ type: [SchemaTypes.ObjectId], ref: 'Project', default: [] })
  linkedProjects!: Types.ObjectId[];

  @Prop({ type: [GrantDisbursementSchema], default: [] })
  disbursements!: GrantDisbursement[];

  @Prop({ type: [GrantReportingObligationSchema], default: [] })
  reportingSchedule!: GrantReportingObligation[];

  /**
   * Denormalised from `reportingSchedule` on every write: the earliest
   * unsubmitted due date. Donor dashboards filter on this, so it is stored
   * rather than computed per query.
   */
  @Prop({ type: Date, default: null })
  nextReportDue?: Date | null;

  /** Set when the expiry webhook/notification fired, so it fires only once. */
  @Prop({ type: Date, default: null })
  expiryNotifiedAt?: Date | null;

  @Prop({ default: true })
  requiresMonthlyReporting!: boolean;

  @Prop({ default: true })
  requiresFinalReport!: boolean;

  @Prop({ trim: true })
  termsAndConditions?: string;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  createdBy?: Types.ObjectId;

  @Prop({ type: SchemaTypes.ObjectId, ref: 'User' })
  updatedBy?: Types.ObjectId;
}

export const GrantSchema = SchemaFactory.createForClass(Grant);

// ─── Indexes ──────────────────────────────────────────────────────────────────
GrantSchema.index({ organizationId: 1 });
GrantSchema.index({ donorId: 1 });
GrantSchema.index({ status: 1 });
GrantSchema.index({ organizationId: 1, status: 1 });
GrantSchema.index({ organizationId: 1, parentGrantId: 1 });
GrantSchema.index({ organizationId: 1, nextReportDue: 1 });
GrantSchema.index({ organizationId: 1, isOverspent: 1 });
