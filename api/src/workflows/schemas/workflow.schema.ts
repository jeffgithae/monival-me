import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

export enum WorkflowEntityType {
  ACTIVITY   = 'activity',
  REPORT     = 'report',
  GRANT      = 'grant',
  BUDGET     = 'budget',
  DOCUMENT   = 'document',
  BENEFICIARY = 'beneficiary',
  INDICATOR_RESULT = 'indicator_result',
}

export enum ApprovalAction {
  APPROVE  = 'approve',
  REJECT   = 'reject',
  ESCALATE = 'escalate',
  RECALL   = 'recall',
  COMMENT  = 'comment',
}

export enum WorkflowStatus {
  PENDING    = 'pending',
  IN_REVIEW  = 'in_review',
  APPROVED   = 'approved',
  REJECTED   = 'rejected',
  ESCALATED  = 'escalated',
  CANCELLED  = 'cancelled',
  RECALLED   = 'recalled',
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

@Schema({ _id: false })
export class WorkflowStepDefinition {
  @Prop({ required: true }) order!: number;           // 1-based step number
  @Prop({ required: true }) name!: string;            // e.g. "Supervisor Review"
  @Prop() description?: string;
  @Prop({ required: true }) approverRole!: string;    // OrgRole value
  @Prop({ type: Types.ObjectId }) approverUserId?: Types.ObjectId; // Specific user override
  @Prop({ default: 72 })       escalateAfterHours!: number; // Auto-escalate SLA
  @Prop({ type: Types.ObjectId }) escalateTo?: Types.ObjectId;    // User to escalate to
  @Prop({ default: false })    requiresComment!: boolean;
  @Prop({ default: false })    isOptional!: boolean;
}

@Schema({ _id: false })
export class ApprovalEvent {
  @Prop({ required: true })                                  stepOrder!: number;
  @Prop({ required: true })                                  stepName!: string;
  @Prop({ required: true, enum: ApprovalAction })            action!: ApprovalAction;
  @Prop({ required: true, type: Types.ObjectId })            actorUserId!: Types.ObjectId;
  @Prop({ required: true })                                  actorName!: string;
  @Prop({ required: true })                                  actorRole!: string;
  @Prop()                                                    comment?: string;
  @Prop({ required: true, default: () => new Date() })       createdAt!: Date;
  @Prop({ type: Types.ObjectId })                            delegatedFrom?: Types.ObjectId; // if escalated
}

// ─── WorkflowDefinition ───────────────────────────────────────────────────────
// The reusable template an org configures once

export type WorkflowDefinitionDocument = WorkflowDefinition & Document;

@Schema({ timestamps: true, collection: 'workflow_definitions' })
export class WorkflowDefinition {
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true })                       name!: string;
  @Prop()                                         description?: string;
  @Prop({ required: true, enum: WorkflowEntityType }) entityType!: WorkflowEntityType;
  @Prop({ type: [WorkflowStepDefinition], default: [] }) steps!: WorkflowStepDefinition[];
  @Prop({ default: true })                        isActive!: boolean;
  @Prop({ default: false })                       isDefault!: boolean;  // auto-assign to new entities
  @Prop({ type: Types.ObjectId })                 createdBy!: Types.ObjectId;
  @Prop({ type: Types.ObjectId })                 lastModifiedBy?: Types.ObjectId;
}

export const WorkflowDefinitionSchema = SchemaFactory.createForClass(WorkflowDefinition);
WorkflowDefinitionSchema.index({ organizationId: 1, entityType: 1 });
WorkflowDefinitionSchema.index({ organizationId: 1, isDefault: 1, entityType: 1 });

// ─── WorkflowInstance ─────────────────────────────────────────────────────────
// One per submitted entity

export type WorkflowInstanceDocument = WorkflowInstance & Document;

@Schema({ timestamps: true, collection: 'workflow_instances' })
export class WorkflowInstance {
  @Prop({ required: true, type: Types.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true, type: Types.ObjectId }) definitionId!: Types.ObjectId;
  @Prop({ required: true, enum: WorkflowEntityType }) entityType!: WorkflowEntityType;
  @Prop({ required: true, type: Types.ObjectId }) entityId!: Types.ObjectId;
  @Prop({ required: true })                       entityTitle!: string;
  @Prop({ required: true, type: Types.ObjectId }) initiatedBy!: Types.ObjectId;
  @Prop()                                         initiatedByName?: string;

  @Prop({ required: true, enum: WorkflowStatus, default: WorkflowStatus.PENDING })
  status!: WorkflowStatus;

  @Prop({ required: true, default: 1 })           currentStep!: number;   // which step we're on
  @Prop({ required: true, default: 0 })           totalSteps!: number;

  // Snapshot of steps from the definition at creation time (immutable audit trail)
  @Prop({ type: [WorkflowStepDefinition] })        steps!: WorkflowStepDefinition[];

  // Full audit history of every action taken
  @Prop({ type: [ApprovalEvent], default: [] })    history!: ApprovalEvent[];

  // Escalation tracking
  @Prop()                                          escalatedAt?: Date;
  @Prop({ type: Types.ObjectId })                  escalatedTo?: Types.ObjectId;
  @Prop()                                          escalationReason?: string;

  // SLA deadline for current step
  @Prop()                                          stepDeadline?: Date;

  // Final outcomes
  @Prop()                                          completedAt?: Date;
  @Prop()                                          rejectionReason?: string;
  @Prop()                                          approvalNotes?: string;
}

export const WorkflowInstanceSchema = SchemaFactory.createForClass(WorkflowInstance);
WorkflowInstanceSchema.index({ organizationId: 1, status: 1 });
WorkflowInstanceSchema.index({ organizationId: 1, entityType: 1, entityId: 1 });
WorkflowInstanceSchema.index({ organizationId: 1, status: 1, stepDeadline: 1 }); // for escalation cron
