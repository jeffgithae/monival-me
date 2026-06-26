import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { CopilotService } from './copilot.service';
import { CopilotMessageDto } from './dto/copilot-message.dto';
import { DraftReportDto } from './dto/draft-report.dto';

@ApiTags('AI Copilot')
@Controller('ai/copilot')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class CopilotController {
  constructor(private readonly svc: CopilotService) {}

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
    @Body() body: { title: string; level: string; sector?: string; unit?: string },
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
}