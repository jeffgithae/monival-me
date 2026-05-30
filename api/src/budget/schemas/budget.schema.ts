import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum BudgetCategory {
  OPERATIONAL = 'operational',
  PROJECT = 'project',
  EMERGENCY = 'emergency',
  STRATEGIC = 'strategic',
  PERSONNEL = 'personnel',
  TRAVEL = 'travel',
  EQUIPMENT = 'equipment',
  INDIRECT = 'indirect',
}

export enum BudgetStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  ACTIVE = 'active',
  UNDER_REVIEW = 'under_review',
  CLOSED = 'closed',
  ARCHIVED = 'archived',
}

export enum LineItemStatus {
  PLANNED = 'planned',
  COMMITTED = 'committed',
  SPENT = 'spent',
  CANCELLED = 'cancelled',
}

export enum AlertSeverity {
  INFO = 'info',
  WARNING = 'warning',
  CRITICAL = 'critical',
}

export enum RevisionReason {
  REALLOCATION = 'reallocation',
  SCOPE_CHANGE = 'scope_change',
  DONOR_AMENDMENT = 'donor_amendment',
  COST_SAVINGS = 'cost_savings',
  EMERGENCY = 'emergency',
  OTHER = 'other',
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class BudgetRevision {
  @Prop({ required: true }) revisedAt!: Date;
  @Prop({ required: true, type: Types.ObjectId }) revisedBy!: Types.ObjectId;
  @Prop({ required: true }) previousAmount!: number;
  @Prop({ required: true }) newAmount!: number;
  @Prop({ required: true, enum: RevisionReason }) reason!: RevisionReason;
  @Prop() notes?: string;
  @Prop({ default: 0 }) revisionNumber!: number;
}

@Schema({ _id: false })
export class BudgetAlertThreshold {
  @Prop({ required: true, min: 0, max: 100 }) warningPercent!: number;   // e.g. 75
  @Prop({ required: true, min: 0, max: 100 }) criticalPercent!: number;  // e.g. 90
  @Prop({ default: true }) notifyFinance!: boolean;
  @Prop({ default: true }) notifyAdmin!: boolean;
  @Prop({ type: [String], default: [] }) additionalEmails!: string[];
}

@Schema({ _id: false })
export class ExchangeRateSnapshot {
  @Prop({ required: true }) baseCurrency!: string;
  @Prop({ required: true }) targetCurrency!: string;
  @Prop({ required: true }) rate!: number;
  @Prop({ required: true }) snapshotDate!: Date;
}

@Schema({ _id: false })
export class BurnRateSnapshot {
  @Prop({ required: true }) period!: string;       // "2026-01"
  @Prop({ required: true }) spent!: number;
  @Prop({ required: true }) budgeted!: number;
  @Prop({ required: true }) burnRate!: number;     // spent / budgeted * 100
  @Prop({ required: true }) projectedTotal!: number; // annualised projection
  @Prop({ required: true }) calculatedAt!: Date;
}

// ─── BudgetAllocation ─────────────────────────────────────────────────────────

export type BudgetAllocationDocument = BudgetAllocation & Document;

@Schema({ timestamps: true, collection: 'budget_allocations' })
export class BudgetAllocation {
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true }) name!: string;
  @Prop() description?: string;
  @Prop({ type: Types.ObjectId }) projectId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) grantId?: Types.ObjectId;     // Link to grants module

  // Amounts
  @Prop({ required: true, min: 0 }) allocatedAmount!: number;
  @Prop({ default: 0, min: 0 }) spentAmount!: number;
  @Prop({ default: 0, min: 0 }) committedAmount!: number;
  @Prop({ default: 0 }) uncommittedAmount!: number; // computed: allocated - committed

  // Currency
  @Prop({ default: 'USD' }) currency!: string;
  @Prop({ type: ExchangeRateSnapshot }) exchangeRate?: ExchangeRateSnapshot;
  @Prop({ default: 0 }) allocatedAmountUSD!: number; // normalised for reporting

  // Classification
  @Prop({ required: true, enum: BudgetCategory }) category!: BudgetCategory;
  @Prop({ required: true, enum: BudgetStatus, default: BudgetStatus.DRAFT }) status!: BudgetStatus;
  @Prop({ required: true }) fiscalYear!: number;
  @Prop({ required: true }) startDate!: Date;
  @Prop({ required: true }) endDate!: Date;

  // Restriction & compliance
  @Prop({ type: [String], default: [] }) allowedExpenseTypes!: string[];
  @Prop({ default: false }) isRestricted!: boolean; // donor-restricted fund
  @Prop({ type: Types.ObjectId }) donorId?: Types.ObjectId;

  // Approval
  @Prop({ type: Types.ObjectId }) approvedBy?: Types.ObjectId;
  @Prop() approvalDate?: Date;
  @Prop() approvalNotes?: string;

  // Alert thresholds
  @Prop({ type: BudgetAlertThreshold }) alertThresholds?: BudgetAlertThreshold;

  // Revision history (full audit trail)
  @Prop({ type: [BudgetRevision], default: [] }) revisions!: BudgetRevision[];
  @Prop({ default: 0 }) currentRevisionNumber!: number;

  // Burn rate snapshots (computed monthly)
  @Prop({ type: [BurnRateSnapshot], default: [] }) burnRateHistory!: BurnRateSnapshot[];

  // Metadata
  @Prop({ required: true, type: Types.ObjectId }) createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) lastModifiedBy?: Types.ObjectId;
  @Prop() closedAt?: Date;
  @Prop() archivedAt?: Date;
  @Prop({ default: false }) isDeleted!: boolean;
}

export const BudgetAllocationSchema = SchemaFactory.createForClass(BudgetAllocation);

// Indexes for performance
BudgetAllocationSchema.index({ organizationId: 1, status: 1 });
BudgetAllocationSchema.index({ organizationId: 1, fiscalYear: 1 });
BudgetAllocationSchema.index({ projectId: 1 });
BudgetAllocationSchema.index({ grantId: 1 });
BudgetAllocationSchema.index({ isDeleted: 1 });

// ─── BudgetLineItem ───────────────────────────────────────────────────────────

export type BudgetLineItemDocument = BudgetLineItem & Document;

@Schema({ timestamps: true, collection: 'budget_line_items' })
export class BudgetLineItem {
  @Prop({ required: true, type: Types.ObjectId }) budgetAllocationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;

  @Prop({ required: true }) description!: string;
  @Prop({ required: true }) costCategory!: string;   // salaries, travel, supplies, etc.
  @Prop({ required: true }) unitDescription!: string; // "person-month", "trip", "unit"
  @Prop({ required: true, min: 0 }) quantity!: number;
  @Prop({ required: true, min: 0 }) unitCost!: number;
  @Prop({ required: true, min: 0 }) amount!: number;  // quantity * unitCost
  @Prop({ default: 0, min: 0 }) spent!: number;
  @Prop({ default: 0, min: 0 }) committed!: number;

  @Prop({ required: true, enum: LineItemStatus, default: LineItemStatus.PLANNED }) status!: LineItemStatus;
  @Prop() notes?: string;

  // M&E linkage
  @Prop({ type: Types.ObjectId }) linkedActivityId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) linkedIndicatorId?: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) linkedGrantId?: Types.ObjectId;

  // Reporting period linkage
  @Prop({ type: Types.ObjectId }) reportingPeriodId?: Types.ObjectId;

  // Expense evidence / attachment reference
  @Prop({ type: [String], default: [] }) attachmentUrls!: string[];
  @Prop() invoiceReference?: string;
  @Prop() paymentDate?: Date;

  // Donor cost category (e.g., USAID cost categories)
  @Prop() donorCostCategory?: string;

  @Prop({ required: true, type: Types.ObjectId }) createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId }) lastModifiedBy?: Types.ObjectId;
  @Prop({ default: false }) isDeleted!: boolean;
}

export const BudgetLineItemSchema = SchemaFactory.createForClass(BudgetLineItem);

BudgetLineItemSchema.index({ budgetAllocationId: 1 });
BudgetLineItemSchema.index({ organizationId: 1 });
BudgetLineItemSchema.index({ linkedActivityId: 1 });

// ─── BudgetVariance ───────────────────────────────────────────────────────────

export type BudgetVarianceDocument = BudgetVariance & Document;

@Schema({ timestamps: true, collection: 'budget_variances' })
export class BudgetVariance {
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId }) budgetAllocationId!: Types.ObjectId;
  @Prop({ required: true }) period!: string;             // "2026-01"
  @Prop({ required: true }) budgetedAmount!: number;
  @Prop({ required: true }) actualAmount!: number;
  @Prop({ required: true }) variance!: number;           // budgeted - actual
  @Prop({ required: true }) variancePercentage!: number;
  @Prop({ required: true, enum: ['favorable', 'unfavorable', 'on_track'] }) trend!: string;
  @Prop({ required: true }) burnRate!: number;           // actual / budgeted * 100
  @Prop() projectedYearEnd!: number;                     // extrapolated year-end spend
  @Prop() notes?: string;
  @Prop({ required: true, enum: AlertSeverity, default: AlertSeverity.INFO }) alertLevel!: AlertSeverity;
  @Prop({ default: false }) alertSent!: boolean;
  @Prop({ required: true, type: Types.ObjectId }) calculatedBy!: Types.ObjectId;
}

export const BudgetVarianceSchema = SchemaFactory.createForClass(BudgetVariance);

BudgetVarianceSchema.index({ budgetAllocationId: 1, period: 1 }, { unique: true });
BudgetVarianceSchema.index({ organizationId: 1, period: 1 });

// ─── AuditEvent (budget-specific) ────────────────────────────────────────────

export type BudgetAuditEventDocument = BudgetAuditEvent & Document;

@Schema({ timestamps: true, collection: 'budget_audit_events' })
export class BudgetAuditEvent {
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId }) userId!: Types.ObjectId;
  @Prop({ required: true }) userEmail!: string;
  @Prop({ required: true }) action!: string; // CREATE_ALLOCATION | APPROVE | REVISE | CLOSE | etc.
  @Prop({ required: true }) entity!: string; // BudgetAllocation | BudgetLineItem | BudgetVariance
  @Prop({ required: true, type: Types.ObjectId }) entityId!: Types.ObjectId;
  @Prop({ type: Object }) before?: Record<string, any>;
  @Prop({ type: Object }) after?: Record<string, any>;
  @Prop() ipAddress?: string;
  @Prop() reason?: string;
}

export const BudgetAuditEventSchema = SchemaFactory.createForClass(BudgetAuditEvent);
BudgetAuditEventSchema.index({ organizationId: 1, createdAt: -1 });
BudgetAuditEventSchema.index({ entityId: 1 });