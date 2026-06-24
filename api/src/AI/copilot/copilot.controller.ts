import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { CopilotService, DraftReportDto } from './copilot.service';
import { CopilotMessageDto } from './dto/copilot-message.dto';

@ApiTags('Copilot')
@Controller('ai/copilot')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  /**
   * General-purpose M&E copilot chat.
   * Accepts a natural-language message and returns a contextual answer,
   * data-backed recommendations, and a structured portfolio context object.
   */
  @Post('message')
  @ApiOperation({ summary: 'Ask the M&E copilot a question about your portfolio' })
  message(@CurrentUser() user: JwtPayload, @Body() dto: CopilotMessageDto) {
    return this.copilotService.message(user.organizationId, dto);
  }

  /**
   * AI Donor Report Drafter.
   *
   * Aggregates all approved activities, indicator results, grant financials,
   * and stakeholder feedback for a given reporting period, then composes a
   * structured first-draft donor report the user can review and submit.
   *
   * Body:
   *   - reportingPeriodId (required): the period to draft the report for
   *   - style: 'narrative' | 'bullet' | 'executive'  (default: narrative)
   *   - includeFinancials: boolean (default: true)
   *   - includeFeedback:   boolean (default: true)
   */
  @Post('draft-report')
  @ApiOperation({ summary: 'AI-generated first-draft donor report for a reporting period' })
  draftReport(@CurrentUser() user: JwtPayload, @Body() dto: DraftReportDto) {
    return this.copilotService.draftReport(user.organizationId, dto);
  }
}
