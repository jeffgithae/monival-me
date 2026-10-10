import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { FxService } from './fx.service';
import { OrganizationsService } from '../organizations/organizations.service';
import { SetManualRatesDto } from './dto/fx.dto';

@Controller('fx')
@UseGuards(JwtAuthGuard, RolesGuard)
export class FxController {
  constructor(
    private readonly fx: FxService,
    private readonly organizations: OrganizationsService,
  ) {}

  @Get('rate')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  rate(@CurrentUser() user: JwtPayload, @Query('from') from: string, @Query('to') to: string) {
    return this.fx.getRate(from, to, user.organizationId);
  }

  /** Market rates for a base currency, with this organisation's overrides. */
  @Get('rates')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE, OrgRole.ME_OFFICER)
  async rates(@CurrentUser() user: JwtPayload, @Query('base') base?: string) {
    // Defaults to the organisation's reporting currency.
    const baseCurrency = base || (await this.organizations.findById(user.organizationId)).baseCurrency;
    return this.fx.ratesFor(user.organizationId, baseCurrency);
  }

  /** Force a refresh of the shared market rates rather than waiting for the nightly cron. */
  @Post('refresh')
  @Throttle({ default: { ttl: 60_000, limit: 5 } })
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  async refresh(@Query('base') base?: string) {
    const ok = base ? await this.fx.refresh(base) : ((await this.fx.refreshAll()), true);
    return { refreshed: ok };
  }

  /** This organisation's own rates, for donors that mandate a fixed accounting rate. */
  @Post('manual')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.FINANCE)
  setManual(@CurrentUser() user: JwtPayload, @Body() dto: SetManualRatesDto) {
    return this.fx.setManualRates(user.organizationId, dto.baseCurrency, dto.rates);
  }
}
