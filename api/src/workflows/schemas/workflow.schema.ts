import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types, SchemaTypes } from 'mongoose';

// ─── Enums ────────────────────────────────────────────────────────────────────

// Entity types are governed by the registry (workflow-entity.registry.ts) —
// stored as plain strings so new registry entries need no schema change.
export type { WorkflowEntityType } from '../workflow-entity.registry';
import type { WorkflowEntityType } from '../workflow-entity.registry';

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
  @Prop({ type: SchemaTypes.ObjectId }) approverUserId?: Types.ObjectId; // Specific user override
  @Prop({ default: 72 })       escalateAfterHours!: number; // Auto-escalate SLA
  @Prop({ type: SchemaTypes.ObjectId }) escalateTo?: Types.ObjectId;    // User to escalate to
  @Prop({ default: false })    requiresComment!: boolean;
  @Prop({ default: false })    isOptional!: boolean;
}

@Schema({ _id: false })
export class ApprovalEvent {
  @Prop({ required: true })                                  stepOrder!: number;
  @Prop({ required: true })                                  stepName!: string;
  @Prop({ required: true, enum: ApprovalAction })            action!: ApprovalAction;
  @Prop({ required: true, type: SchemaTypes.ObjectId })            actorUserId!: Types.ObjectId;
  @Prop({ required: true })                                  actorName!: string;
  @Prop({ required: true })                                  actorRole!: string;
  @Prop()                                                    comment?: string;
  @Prop({ required: true, default: () => new Date() })       createdAt!: Date;
  @Prop({ type: SchemaTypes.ObjectId })                            delegatedFrom?: Types.ObjectId; // if escalated
}

// ─── WorkflowDefinition ───────────────────────────────────────────────────────
// The reusable template an org configures once

export type WorkflowDefinitionDocument = WorkflowDefinition & Document;

@Schema({ timestamps: true, collection: 'workflow_definitions' })
export class WorkflowDefinition {
  @Prop({ required: true, type: SchemaTypes.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true })                       name!: string;
  @Prop()                                         description?: string;
  @Prop({ required: true, type: String })         entityType!: WorkflowEntityType;
  @Prop({ type: [WorkflowStepDefinition], default: [] }) steps!: WorkflowStepDefinition[];
  @Prop({ default: true })                        isActive!: boolean;
  @Prop({ default: false })                       isDefault!: boolean;  // auto-assign to new entities
  @Prop({ type: SchemaTypes.ObjectId })                 createdBy!: Types.ObjectId;
  @Prop({ type: SchemaTypes.ObjectId })                 lastModifiedBy?: Types.ObjectId;
}

export const WorkflowDefinitionSchema = SchemaFactory.createForClass(WorkflowDefinition);
WorkflowDefinitionSchema.index({ organizationId: 1, entityType: 1 });
WorkflowDefinitionSchema.index({ organizationId: 1, isDefault: 1, entityType: 1 });

// ─── WorkflowInstance ─────────────────────────────────────────────────────────
// One per submitted entity

export type WorkflowInstanceDocument = WorkflowInstance & Document;

@Schema({ timestamps: true, collection: 'workflow_instances' })
export class WorkflowInstance {
  @Prop({ required: true, type: SchemaTypes.ObjectId }) organizationId!: Types.ObjectId;
  @Prop({ required: true, type: SchemaTypes.ObjectId }) definitionId!: Types.ObjectId;
  @Prop({ required: true, type: String })         entityType!: WorkflowEntityType;
  @Prop({ required: true, type: SchemaTypes.ObjectId }) entityId!: Types.ObjectId;
  @Prop({ required: true })                       entityTitle!: string;
  @Prop({ required: true, type: SchemaTypes.ObjectId }) initiatedBy!: Types.ObjectId;
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
  @Prop({ type: SchemaTypes.ObjectId })                  escalatedTo?: Types.ObjectId;
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
