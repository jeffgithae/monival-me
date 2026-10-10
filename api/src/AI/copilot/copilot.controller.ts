import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { SkipThrottle, Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PERMISSIONS } from '../../common/constants/roles';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { AiUsageService } from '../ai-usage.service';
import { CopilotService } from './copilot.service';
import { CopilotMessageDto } from './dto/copilot-message.dto';
import { DraftReportDto } from './dto/draft-report.dto';
import { SuggestIndicatorBody } from '../../common/dto/request-bodies.dto';

@ApiTags('AI Copilot')
@Controller('ai/copilot')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
// Every route here is a model completion billed to us. The global tiers
// (300/min) are far too loose for that, so the whole controller runs on a tight
// per-user limit; the per-organisation monthly token budget is enforced
// separately in AiUsageService, before the provider call.
@Throttle({ default: { ttl: 60_000, limit: 10 } })
@Roles(...PERMISSIONS.USE_AI_COPILOT)
export class CopilotController {
  constructor(
    private readonly svc: CopilotService,
    private readonly aiUsage: AiUsageService,
  ) {}

  /**
   * POST /ai/copilot/message
   * General-purpose M&E chat with full portfolio context.
   * Supports multi-turn via the optional `history` array.
   */
  @Post('message')
  @ApiOperation({ summary: 'Ask the Evidara M&E Copilot a question about your portfolio' })
  message(@CurrentUser() user: JwtPayload, @Body() dto: CopilotMessageDto) {
    return this.svc.message(user.organizationId, dto);
  }

  /**
   * POST /ai/copilot/draft-report
   * AI-generated donor report draft for a completed reporting period.
   */
  @Throttle({ default: { ttl: 60_000, limit: 3 } })
  @Post('draft-report')
  @ApiOperation({ summary: 'Generate a first-draft donor report for a reporting period' })
  draftReport(@CurrentUser() user: JwtPayload, @Body() dto: DraftReportDto) {
    return this.svc.draftReport(user.organizationId, dto);
  }

  /**
   * GET /ai/copilot/theory-of-change/:projectId
   * Generate a Theory of Change narrative for a project.
   */
  @Get('theory-of-change/:projectId')
  @ApiOperation({ summary: 'Generate a Theory of Change for a project' })
  generateToC(
    @CurrentUser() user: JwtPayload,
    @Param('projectId') projectId: string,
  ) {
    return this.svc.generateToC(user.organizationId, projectId);
  }

  /**
   * POST /ai/copilot/indicator-definition
   * Generate a complete SMART indicator definition.
   */
  @Post('indicator-definition')
  @ApiOperation({ summary: 'Generate a SMART indicator definition' })
  indicatorDefinition(
    @CurrentUser() user: JwtPayload,
    @Body() body: SuggestIndicatorBody,
  ) {
    return this.svc.generateIndicatorDefinition(user.organizationId, body);
  }

  /**
   * GET /ai/copilot/suggest-actions
   * Adaptive management recommendations based on current portfolio state.
   */
  @Get('suggest-actions')
  @ApiOperation({ summary: 'Get adaptive management action recommendations' })
  suggestActions(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
  ) {
    return this.svc.suggestActions(user.organizationId, projectId);
  }

  /**
   * GET /ai/copilot/usage
   * This month's Copilot token consumption and the plan's remaining allowance.
   */
  @SkipThrottle()
  @Get('usage')
  @ApiOperation({ summary: "This month's AI Copilot usage and remaining allowance" })
  usage(@CurrentUser() user: JwtPayload) {
    return this.aiUsage.currentUsage(user.organizationId);
  }
}