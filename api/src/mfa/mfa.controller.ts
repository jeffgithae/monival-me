import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { MfaService } from './mfa.service';

@Controller('mfa')
@UseGuards(JwtAuthGuard)
export class MfaController {
  constructor(private readonly mfaService: MfaService) {}

  /**
   * GET /mfa/status
   * Returns whether MFA is enabled and how many backup codes remain.
   */
  @Get('status')
  status(@CurrentUser() user: JwtPayload) {
    return this.mfaService.status(user.sub);
  }

  /**
   * POST /mfa/enroll
   * Start TOTP enrolment — returns a QR code data URL to scan with an
   * authenticator app (Google Authenticator, Authy, 1Password, etc.).
   */
  @Post('enroll')
  enrollStart(@CurrentUser() user: JwtPayload) {
    return this.mfaService.enrollStart(user.sub);
  }

  /**
   * POST /mfa/enroll/verify
   * Confirm the first TOTP code and activate MFA.
   * Returns one-time backup codes — the user must store these immediately.
   */
  @Post('enroll/verify')
  enrollVerify(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code: string },
  ) {
    return this.mfaService.enrollVerify(user.sub, body.code);
  }

  /**
   * POST /mfa/disable
   * Disable MFA after confirming with a valid TOTP code.
   */
  @Post('disable')
  disable(
    @CurrentUser() user: JwtPayload,
    @Body() body: { code: string },
  ) {
    return this.mfaService.disable(user.sub, body.code);
  }
}