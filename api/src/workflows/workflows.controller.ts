import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
  HttpCode, HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { WorkflowService } from './workflows.service';
import {
  CreateWorkflowDefinitionDto, UpdateWorkflowDefinitionDto,
  StartWorkflowDto, ActOnWorkflowDto, WorkflowQueryDto,
} from './dto/workflow.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { OrgRole } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';
import { WorkflowEntityType } from './schemas/workflow.schema';

@ApiTags('Workflow & Approvals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard, SubscriptionGuard)
@Controller('workflows')
export class WorkflowsController {
  constructor(private readonly svc: WorkflowService) {}

  // ══════════════════════════════════════════════════════════════════════════
  // DEFINITIONS
  // ══════════════════════════════════════════════════════════════════════════

  @Post('definitions')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Create a configurable workflow definition (template)' })
  createDefinition(@Body() dto: CreateWorkflowDefinitionDto, @CurrentUser() user: JwtPayload) {
    return this.svc.createDefinition(dto, user);
  }

  @Get('definitions')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'List all workflow definitions for the org' })
  listDefinitions(
    @CurrentUser() user: JwtPayload,
    @Query('entityType') entityType?: WorkflowEntityType,
  ) {
    return this.svc.listDefinitions(user.organizationId, entityType);
  }

  @Get('definitions/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.FIELD_OFFICER, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get a single workflow definition' })
  @ApiParam({ name: 'id' })
  getDefinition(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.getDefinition(id, user.organizationId);
  }

  @Patch('definitions/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Update a workflow definition (steps, name, default flag)' })
  @ApiParam({ name: 'id' })
  updateDefinition(
    @Param('id') id: string,
    @Body() dto: UpdateWorkflowDefinitionDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.updateDefinition(id, dto, user);
  }

  @Delete('definitions/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  @ApiOperation({ summary: 'Delete a workflow definition (only if no active instances)' })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.NO_CONTENT)
  deleteDefinition(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.deleteDefinition(id, user.organizationId);
  }

  // ══════════════════════════════════════════════════════════════════════════
  // INSTANCES
  // ══════════════════════════════════════════════════════════════════════════

  @Post('instances')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.FINANCE)
  @ApiOperation({
    summary: 'Submit an entity for approval (starts a workflow instance)',
    description: 'Triggers the first step and sends notifications to the initial approvers.',
  })
  startWorkflow(@Body() dto: StartWorkflowDto, @CurrentUser() user: JwtPayload) {
    return this.svc.startWorkflow(dto, user);
  }

  @Get('instances')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  @ApiOperation({ summary: 'List workflow instances (filterable by status, entityType, or assigned to me)' })
  listInstances(@CurrentUser() user: JwtPayload, @Query() query: WorkflowQueryDto) {
    return this.svc.listInstances(user.organizationId, user, query);
  }

  @Get('instances/my-tasks')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get all pending tasks assigned to the current user' })
  getMyTasks(@CurrentUser() user: JwtPayload) {
    return this.svc.getMyPendingTasks(user.organizationId, user);
  }

  @Get('summary')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Org-level workflow health summary (pending, overdue, escalated counts)' })
  getSummary(@CurrentUser() user: JwtPayload) {
    return this.svc.getSummary(user.organizationId);
  }

  @Get('instances/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.FINANCE, OrgRole.VIEWER)
  @ApiOperation({ summary: 'Get a workflow instance with full approval history' })
  @ApiParam({ name: 'id' })
  getInstance(@Param('id') id: string, @CurrentUser() user: JwtPayload) {
    return this.svc.getInstance(id, user.organizationId);
  }

  @Post('instances/:id/action')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER, OrgRole.FIELD_OFFICER, OrgRole.FINANCE)
  @ApiOperation({
    summary: 'Act on a workflow (approve / reject / escalate / recall / comment)',
    description:
      'Approve advances to the next step or completes the workflow. ' +
      'Reject terminates with reason. Escalate assigns to another user. ' +
      'Recall retracts the submission. Comment adds a note without changing status.',
  })
  @ApiParam({ name: 'id' })
  @HttpCode(HttpStatus.OK)
  actOnInstance(
    @Param('id') id: string,
    @Body() dto: ActOnWorkflowDto,
    @CurrentUser() user: JwtPayload,
  ) {
    return this.svc.actOnInstance(id, dto, user);
  }
}