import {
  Injectable, NotFoundException, BadRequestException,
  ForbiddenException, Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';

import {
  WorkflowDefinition, WorkflowDefinitionDocument,
  WorkflowInstance, WorkflowInstanceDocument,
  WorkflowStatus, ApprovalAction, WorkflowEntityType,
  ApprovalEvent,
} from './schemas/workflow.schema';
import {
  CreateWorkflowDefinitionDto, UpdateWorkflowDefinitionDto,
  StartWorkflowDto, ActOnWorkflowDto, WorkflowQueryDto,
} from './dto/workflow.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { OrgRole } from '../common/constants/roles';

// ─── Interfaces ───────────────────────────────────────────────────────────────

interface RequestUser {
  _id: string | Types.ObjectId;
  email: string;
  name?: string;
  organizationId: string | Types.ObjectId;
  role: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class WorkflowService {
  private readonly logger = new Logger(WorkflowService.name);

  constructor(
    @InjectModel(WorkflowDefinition.name)
    private readonly definitionModel: Model<WorkflowDefinitionDocument>,

    @InjectModel(WorkflowInstance.name)
    private readonly instanceModel: Model<WorkflowInstanceDocument>,

    private readonly notifications: NotificationsService,
  ) {}

  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOW DEFINITIONS (templates)
  // ══════════════════════════════════════════════════════════════════════════

  async createDefinition(
    dto: CreateWorkflowDefinitionDto,
    user: RequestUser,
  ): Promise<WorkflowDefinitionDocument> {
    this._validateSteps(dto.steps);

    // If marking as default, un-default others of same type
    if (dto.isDefault) {
      await this.definitionModel.updateMany(
        { organizationId: user.organizationId, entityType: dto.entityType, isDefault: true },
        { isDefault: false },
      );
    }

    // Coerce string ObjectId fields inside steps
    const steps = dto.steps.map(s => ({
      ...s,
      approverUserId: s.approverUserId ? new Types.ObjectId(s.approverUserId) : undefined,
      escalateTo:     s.escalateTo     ? new Types.ObjectId(s.escalateTo)     : undefined,
    }));

    return this.definitionModel.create({
      ...dto,
      steps,
      organizationId: user.organizationId,
      createdBy: user._id,
    });
  }

  async listDefinitions(
    organizationId: string,
    entityType?: WorkflowEntityType,
  ): Promise<WorkflowDefinitionDocument[]> {
    const filter: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
    };
    if (entityType) filter.entityType = entityType;
    return this.definitionModel.find(filter).sort({ entityType: 1, createdAt: -1 });
  }

  async getDefinition(
    id: string,
    organizationId: string,
  ): Promise<WorkflowDefinitionDocument> {
    const def = await this.definitionModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!def) throw new NotFoundException('Workflow definition not found');
    return def;
  }

  async updateDefinition(
    id: string,
    dto: UpdateWorkflowDefinitionDto,
    user: RequestUser,
  ): Promise<WorkflowDefinitionDocument> {
    const def = await this.getDefinition(id, String(user.organizationId));

    if (dto.steps) this._validateSteps(dto.steps);

    if (dto.isDefault) {
      await this.definitionModel.updateMany(
        { organizationId: user.organizationId, entityType: def.entityType, isDefault: true, _id: { $ne: def._id } },
        { isDefault: false },
      );
    }

    Object.assign(def, { ...dto, lastModifiedBy: user._id });
    await def.save();
    return def;
  }

  async deleteDefinition(id: string, organizationId: string): Promise<void> {
    const activeInstances = await this.instanceModel.countDocuments({
      definitionId: new Types.ObjectId(id),
      status: { $in: [WorkflowStatus.PENDING, WorkflowStatus.IN_REVIEW, WorkflowStatus.ESCALATED] },
    });
    if (activeInstances > 0) {
      throw new BadRequestException(
        `Cannot delete a definition with ${activeInstances} active workflow instance(s).`,
      );
    }
    await this.definitionModel.deleteOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // WORKFLOW INSTANCES (running processes)
  // ══════════════════════════════════════════════════════════════════════════

  /** Starts a new workflow for a given entity */
  async startWorkflow(
    dto: StartWorkflowDto,
    user: RequestUser,
  ): Promise<WorkflowInstanceDocument> {
    const definition = await this.getDefinition(dto.definitionId, String(user.organizationId));

    if (!definition.isActive) {
      throw new BadRequestException('Workflow definition is inactive');
    }

    const sortedSteps = [...definition.steps].sort((a, b) => a.order - b.order);
    if (!sortedSteps.length) {
      throw new BadRequestException('Workflow has no steps configured');
    }

    const firstStep = sortedSteps[0];
    const stepDeadline = this._calcDeadline(firstStep.escalateAfterHours ?? 72);

    const instance = await this.instanceModel.create({
      organizationId: user.organizationId,
      definitionId: definition._id,
      entityType: dto.entityType,
      entityId: new Types.ObjectId(dto.entityId),
      entityTitle: dto.entityTitle,
      initiatedBy: user._id,
      initiatedByName: user.name ?? user.email,
      status: WorkflowStatus.PENDING,
      currentStep: 1,
      totalSteps: sortedSteps.length,
      steps: sortedSteps,
      history: [],
      stepDeadline,
    });

    // Notify first step approvers
    await this._notifyStep(instance, firstStep, user.organizationId as string);

    this.logger.log(
      `Workflow started: ${instance._id} for ${dto.entityType}:${dto.entityId} by ${user.email}`,
    );

    return instance;
  }

  /** List instances — with optional "assigned to me" filter */
  async listInstances(
    organizationId: string,
    user: RequestUser,
    query: WorkflowQueryDto,
  ) {
    const filter: Record<string, any> = {
      organizationId: new Types.ObjectId(organizationId),
    };

    if (query.status) filter.status = query.status;
    if (query.entityType) filter.entityType = query.entityType;

    if (query.assignedToMe === 'true') {
      // Return instances where user's role matches the current step's approver role
      // OR where user is explicitly named
      const userRole = user.role;
      filter.$or = [
        { 'steps': { $elemMatch: {
          $expr: { $eq: ['$order', '$$ROOT.currentStep'] },
          approverRole: userRole,
        }}},
        { 'steps': { $elemMatch: {
          $expr: { $eq: ['$order', '$$ROOT.currentStep'] },
          approverUserId: new Types.ObjectId(String(user._id)),
        }}},
      ];
    }

    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const [data, total] = await Promise.all([
      this.instanceModel.find(filter).skip(skip).limit(limit).sort({ createdAt: -1 }),
      this.instanceModel.countDocuments(filter),
    ]);

    return { data, total, page, limit };
  }

  async getInstance(id: string, organizationId: string): Promise<WorkflowInstanceDocument> {
    const inst = await this.instanceModel.findOne({
      _id: new Types.ObjectId(id),
      organizationId: new Types.ObjectId(organizationId),
    });
    if (!inst) throw new NotFoundException('Workflow instance not found');
    return inst;
  }

  /**
   * Core action handler: approve / reject / escalate / recall / comment.
   * Implements the full BPMN-like state machine transitions.
   */
  async actOnInstance(
    id: string,
    dto: ActOnWorkflowDto,
    user: RequestUser,
  ): Promise<WorkflowInstanceDocument> {
    const instance = await this.getInstance(id, String(user.organizationId));

    // Validate state allows action
    const terminalStatuses = [WorkflowStatus.APPROVED, WorkflowStatus.REJECTED, WorkflowStatus.CANCELLED];
    if (terminalStatuses.includes(instance.status)) {
      throw new BadRequestException(`Workflow is already ${instance.status}`);
    }

    const currentStepDef = instance.steps.find(s => s.order === instance.currentStep);
    if (!currentStepDef) throw new BadRequestException('Invalid workflow state');

    // Authorization: check user has the right role or is named approver
    if (dto.action !== ApprovalAction.RECALL) {
      this._assertCanAct(user, currentStepDef, instance);
    } else {
      // Only initiator can recall
      if (String(instance.initiatedBy) !== String(user._id)) {
        throw new ForbiddenException('Only the initiator can recall a workflow');
      }
    }

    // Validate comment requirement
    if (
      (dto.action === ApprovalAction.REJECT || currentStepDef.requiresComment) &&
      dto.action !== ApprovalAction.RECALL &&
      !dto.comment?.trim()
    ) {
      throw new BadRequestException('A comment is required for this action');
    }

    const event: ApprovalEvent = {
      stepOrder: instance.currentStep,
      stepName: currentStepDef.name,
      action: dto.action as ApprovalAction,
      actorUserId: new Types.ObjectId(String(user._id)),
      actorName: user.name ?? user.email,
      actorRole: user.role,
      comment: dto.comment,
      createdAt: new Date(),
    };

    instance.history.push(event);

    switch (dto.action as ApprovalAction) {
      case ApprovalAction.APPROVE: {
        await this._handleApprove(instance, user);
        break;
      }
      case ApprovalAction.REJECT: {
        instance.status = WorkflowStatus.REJECTED;
        instance.rejectionReason = dto.comment;
        instance.completedAt = new Date();
        await this._notifyInitiator(instance, 'rejected', dto.comment);
        break;
      }
      case ApprovalAction.ESCALATE: {
        await this._handleEscalate(instance, dto, user, event);
        break;
      }
      case ApprovalAction.RECALL: {
        instance.status = WorkflowStatus.RECALLED;
        instance.completedAt = new Date();
        await this._notifyRoleForStep(
          instance, currentStepDef,
          `Workflow recalled: ${instance.entityTitle}`,
          `${user.name ?? user.email} has recalled the submission.`,
          String(user.organizationId),
        );
        break;
      }
      case ApprovalAction.COMMENT: {
        // Just records the event — no status change
        break;
      }
    }

    await instance.save();
    return instance;
  }

  /** Returns pending tasks for the current user */
  async getMyPendingTasks(organizationId: string, user: RequestUser) {
    const instances = await this.instanceModel.find({
      organizationId: new Types.ObjectId(organizationId),
      status: { $in: [WorkflowStatus.PENDING, WorkflowStatus.IN_REVIEW, WorkflowStatus.ESCALATED] },
    });

    return instances.filter(inst => {
      const step = inst.steps.find(s => s.order === inst.currentStep);
      if (!step) return false;
      if (step.approverUserId?.toString() === String(user._id)) return true;
      if (step.approverRole === user.role) return true;
      if (inst.escalatedTo?.toString() === String(user._id)) return true;
      return false;
    });
  }

  /** Dashboard summary for org-level workflow health */
  async getSummary(organizationId: string) {
    const orgId = new Types.ObjectId(organizationId);

    const [pending, inReview, escalated, approved, rejected, overdue] = await Promise.all([
      this.instanceModel.countDocuments({ organizationId: orgId, status: WorkflowStatus.PENDING }),
      this.instanceModel.countDocuments({ organizationId: orgId, status: WorkflowStatus.IN_REVIEW }),
      this.instanceModel.countDocuments({ organizationId: orgId, status: WorkflowStatus.ESCALATED }),
      this.instanceModel.countDocuments({ organizationId: orgId, status: WorkflowStatus.APPROVED }),
      this.instanceModel.countDocuments({ organizationId: orgId, status: WorkflowStatus.REJECTED }),
      this.instanceModel.countDocuments({
        organizationId: orgId,
        status: { $in: [WorkflowStatus.PENDING, WorkflowStatus.IN_REVIEW] },
        stepDeadline: { $lt: new Date() },
      }),
    ]);

    return { pending, inReview, escalated, approved, rejected, overdue };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ESCALATION CRON — runs every hour
  // ══════════════════════════════════════════════════════════════════════════

  @Cron(CronExpression.EVERY_HOUR)
  async processEscalations() {
    const now = new Date();

    const overdueInstances = await this.instanceModel.find({
      status: { $in: [WorkflowStatus.PENDING, WorkflowStatus.IN_REVIEW] },
      stepDeadline: { $lt: now },
    });

    for (const instance of overdueInstances) {
      try {
        const step = instance.steps.find(s => s.order === instance.currentStep);
        if (!step) continue;

        instance.status = WorkflowStatus.ESCALATED;
        instance.escalatedAt = now;
        instance.escalationReason = `Step "${step.name}" exceeded SLA of ${step.escalateAfterHours}h`;

        const escalateToUserId = step.escalateTo ?? null;
        if (escalateToUserId) {
          instance.escalatedTo = escalateToUserId;
        }

        // Add escalation event to history
        instance.history.push({
          stepOrder: instance.currentStep,
          stepName: step.name,
          action: ApprovalAction.ESCALATE,
          actorUserId: new Types.ObjectId(), // system actor
          actorName: 'System (Auto-Escalation)',
          actorRole: 'system',
          comment: instance.escalationReason,
          createdAt: now,
        } as ApprovalEvent);

        await instance.save();

        // Notify escalation target
        if (escalateToUserId) {
          await this.notifications.create({
            organizationId: String(instance.organizationId),
            userId: String(escalateToUserId),
            type: 'workflow.escalated',
            title: `Workflow Escalated: ${instance.entityTitle}`,
            message: `Step "${step.name}" has exceeded its ${step.escalateAfterHours}h SLA and requires your urgent attention.`,
            entityType: 'workflow',
            entityId: String(instance._id),
            link: `/workflows/${instance._id}`,
          });
        }

        this.logger.warn(`Auto-escalated workflow ${instance._id}: ${instance.escalationReason}`);
      } catch (err) {
        this.logger.error(`Failed to escalate workflow ${instance._id}: ${err}`);
      }
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVATE HELPERS
  // ══════════════════════════════════════════════════════════════════════════

  private async _handleApprove(instance: WorkflowInstanceDocument, user: RequestUser) {
    const nextStep = instance.steps.find(s => s.order === instance.currentStep + 1);

    if (nextStep) {
      // Advance to next step
      instance.currentStep += 1;
      instance.status = WorkflowStatus.IN_REVIEW;
      instance.stepDeadline = this._calcDeadline(nextStep.escalateAfterHours ?? 72);
      instance.escalatedTo = undefined;
      instance.escalatedAt = undefined;

      await this._notifyStep(instance, nextStep, String(user.organizationId));
    } else {
      // All steps approved → DONE
      instance.status = WorkflowStatus.APPROVED;
      instance.completedAt = new Date();
      await this._notifyInitiator(instance, 'approved');
    }
  }

  private async _handleEscalate(
    instance: WorkflowInstanceDocument,
    dto: ActOnWorkflowDto,
    user: RequestUser,
    event: ApprovalEvent,
  ) {
    const targetUserId = dto.escalateToUserId;
    if (!targetUserId) throw new BadRequestException('escalateToUserId is required for escalation');

    instance.status = WorkflowStatus.ESCALATED;
    instance.escalatedAt = new Date();
    instance.escalatedTo = new Types.ObjectId(targetUserId);
    instance.escalationReason = dto.comment;

    event.delegatedFrom = new Types.ObjectId(String(user._id));

    await this.notifications.create({
      organizationId: String(instance.organizationId),
      userId: targetUserId,
      type: 'workflow.escalated',
      title: `Escalated to you: ${instance.entityTitle}`,
      message: dto.comment ?? `${user.name ?? user.email} has escalated this for your review.`,
      entityType: 'workflow',
      entityId: String(instance._id),
      link: `/workflows/${instance._id}`,
    });
  }

  private async _notifyStep(
    instance: WorkflowInstanceDocument,
    step: any,
    organizationId: string,
  ) {
    const title = `Action required: ${instance.entityTitle}`;
    const message = `Step ${instance.currentStep}/${instance.totalSteps}: "${step.name}" awaits your approval.`;
    const link = `/workflows/${instance._id}`;

    if (step.approverUserId) {
      await this.notifications.create({
        organizationId,
        userId: String(step.approverUserId),
        type: 'workflow.action_required',
        title,
        message,
        entityType: 'workflow',
        entityId: String(instance._id),
        link,
      });
    } else {
      await this._notifyRoleForStep(instance, step, title, message, organizationId);
    }
  }

  private async _notifyRoleForStep(
    instance: WorkflowInstanceDocument,
    step: any,
    title: string,
    message: string,
    organizationId: string,
  ) {
    await this.notifications.notifyRoles(
      organizationId,
      [step.approverRole as OrgRole],
      {
        type: 'workflow.action_required',
        title,
        message,
        entityType: 'workflow',
        entityId: String(instance._id),
        link: `/workflows/${instance._id}`,
      },
    );
  }

  private async _notifyInitiator(
    instance: WorkflowInstanceDocument,
    outcome: 'approved' | 'rejected',
    reason?: string,
  ) {
    const isApproved = outcome === 'approved';
    await this.notifications.create({
      organizationId: String(instance.organizationId),
      userId: String(instance.initiatedBy),
      type: `workflow.${outcome}`,
      title: `${instance.entityTitle} ${isApproved ? 'Approved ✓' : 'Rejected ✗'}`,
      message: isApproved
        ? `Your submission has been fully approved through all ${instance.totalSteps} steps.`
        : `Your submission was rejected. Reason: ${reason ?? 'No reason provided.'}`,
      entityType: 'workflow',
      entityId: String(instance._id),
      link: `/workflows/${instance._id}`,
    });
  }

  private _assertCanAct(user: RequestUser, step: any, instance: WorkflowInstanceDocument) {
    const isNamedApprover = step.approverUserId?.toString() === String(user._id);
    const hasRole = step.approverRole === user.role;
    const isEscalatee = instance.escalatedTo?.toString() === String(user._id);
    const isAdminOrOwner = [OrgRole.OWNER, OrgRole.ADMIN].includes(user.role as OrgRole);

    if (!isNamedApprover && !hasRole && !isEscalatee && !isAdminOrOwner) {
      throw new ForbiddenException(
        `You do not have permission to act on this step. Required role: ${step.approverRole}`,
      );
    }
  }

  private _validateSteps(steps: any[]) {
    if (!steps.length) throw new BadRequestException('Workflow must have at least one step');
    const orders = steps.map(s => s.order);
    const unique = new Set(orders);
    if (unique.size !== orders.length) {
      throw new BadRequestException('Step order values must be unique');
    }
    if (!orders.includes(1)) {
      throw new BadRequestException('Steps must start at order 1');
    }
  }

  private _calcDeadline(hours: number): Date {
    return new Date(Date.now() + hours * 60 * 60 * 1000);
  }
}
