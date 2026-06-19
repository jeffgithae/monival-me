import { Throttle } from '@nestjs/throttler';
import { Body, Controller, Get, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import type { JwtPayload } from '../common/types/jwt-payload';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { NavService } from './nav.service';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly navService: NavService,
  ) {}

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('forgot-password')
  forgotPassword(@Body() body: { email: string }) {
    return this.authService.forgotPassword(body.email);
  }

  @Throttle({ default: { ttl: 60000, limit: 3 } })
  @Post('reset-password')
  resetPassword(@Body() body: { token: string; newPassword: string }) {
    return this.authService.resetPassword(body.token, body.newPassword);
  }

  /**
   * POST /auth/refresh
   * Exchange a valid refresh token for a new access token + rotated refresh token.
   * Rate-limited to 30/min — tight enough to prevent brute force, loose enough
   * for silent re-auth on multiple tabs.
   */
  @Throttle({ default: { ttl: 60000, limit: 30 } })
  @Post('refresh')
  refresh(@Body() body: { refreshToken: string }) {
    return this.authService.refreshTokens(body.refreshToken);
  }

  /**
   * POST /auth/logout
   * Revokes the user's refresh token server-side so the session cannot be continued.
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@CurrentUser() user: JwtPayload) {
    return this.authService.revokeRefreshToken(user.sub);
  }

  /**
   * GET /auth/me
   * Throttled to prevent enumeration via repeated token probing.
   */
  @Throttle({ default: { ttl: 60000, limit: 60 } })
  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: JwtPayload) {
    return this.authService.me(user.sub);
  }

  /**
   * GET /auth/menu
   * Throttled — clients should cache this for at least 5 minutes.
   */
  @Throttle({ default: { ttl: 60000, limit: 20 } })
  @Get('menu')
  @UseGuards(JwtAuthGuard)
  menu(@CurrentUser() user: JwtPayload) {
    return this.navService.getMenu(user.sub);
  }

  @Patch('me')
  @UseGuards(JwtAuthGuard)
  updateProfile(@CurrentUser() user: JwtPayload, @Body() dto: { name?: string }) {
    return this.authService.updateProfile(user.sub, dto);
  }

  @Patch('me/password')
  @UseGuards(JwtAuthGuard)
  changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: { currentPassword: string; newPassword: string },
  ) {
    return this.authService.changePassword(user.sub, dto.currentPassword, dto.newPassword);
  }
}