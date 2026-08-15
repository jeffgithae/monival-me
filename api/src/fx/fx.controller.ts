import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { FxService } from './fx.service';
import { SetManualRatesDto } from './dto/fx.dto';

@Controller('fx')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FxController {
  constructor(private readonly fx: FxService) {}

  @Get('rate')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  rate(@Query('from') from: string, @Query('to') to: string) {
    return this.fx.getRate(from, to);
  }

  /** Force a refresh rather than waiting for the nightly cron. */
  @Post('refresh')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  async refresh(@Query('base') base?: string) {
    const ok = base ? await this.fx.refresh(base) : ((await this.fx.refreshAll()), true);
    return { refreshed: ok };
  }

  /** Operator override for orgs whose donors mandate a fixed accounting rate. */
  @Post('manual')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  setManual(@CurrentUser() _user: JwtPayload, @Body() dto: SetManualRatesDto) {
    return this.fx.setManualRates(dto.baseCurrency, dto.rates);
  }
}
