import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { CopilotService } from './copilot.service';
import { CopilotMessageDto } from './dto/copilot-message.dto';

@ApiTags('Copilot')
@Controller('ai/copilot')
@UseGuards(JwtAuthGuard, SubscriptionGuard)
export class CopilotController {
  constructor(private readonly copilotService: CopilotService) {}

  @Post('message')
  message(@CurrentUser() user: JwtPayload, @Body() dto: CopilotMessageDto) {
    return this.copilotService.message(user.organizationId, dto);
  }
}
