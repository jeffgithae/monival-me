import {
  Body,
  Controller,
  Get,
  Headers,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import { IsIn, IsString } from 'class-validator';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import type { PlanId } from '../common/constants/plans';
import { BillingService } from './billing.service';

class CheckoutDto {
  @IsString()
  @IsIn(['starter', 'professional', 'organization', 'scale', 'enterprise'])
  planId!: PlanId;
}

@Controller('billing')
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Get('plans')
  listPlans() {
    return this.billingService.listPlans();
  }

  @Get('status')
  @UseGuards(JwtAuthGuard)
  status(@CurrentUser() user: JwtPayload) {
    return this.billingService.getBillingStatus(user.organizationId);
  }

  @Post('checkout')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  checkout(@CurrentUser() user: JwtPayload, @Body() dto: CheckoutDto) {
    return this.billingService.createCheckoutSession(
      user.organizationId,
      user.sub,
      dto.planId,
    );
  }

  @Post('portal')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  portal(@CurrentUser() user: JwtPayload) {
    return this.billingService.createPortalSession(user.organizationId);
  }

  @Post('webhook')
  webhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ) {
    const raw = req.rawBody ?? Buffer.from('');
    return this.billingService.handleWebhook(raw, signature ?? '');
  }
}
