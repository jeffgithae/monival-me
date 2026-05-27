import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsEmail, IsEnum, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Roles } from '../common/decorators/roles.decorator';
import { OrgRole } from '../common/constants/roles';
import { RolesGuard } from '../common/guards/roles.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import type { JwtPayload } from '../common/types/jwt-payload';
import { MembersService } from './members.service';

class InviteDto {
  @IsEmail()
  email!: string;

  @IsEnum(OrgRole)
  role!: OrgRole;
}

class UpdateRoleDto {
  @IsEnum(OrgRole)
  role!: OrgRole;
}

class AcceptInviteDto {
  @IsString()
  token!: string;
}

@Controller('members')
export class MembersController {
  constructor(private readonly membersService: MembersService) {}

  @Get()
  @UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  list(@CurrentUser() user: JwtPayload) {
    return this.membersService.list(user.organizationId);
  }

  @Get('invites')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  invites(@CurrentUser() user: JwtPayload) {
    return this.membersService.listInvites(user.organizationId);
  }

  @Post('invite')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  invite(@CurrentUser() user: JwtPayload, @Body() dto: InviteDto) {
    return this.membersService.invite(
      user.organizationId,
      user.sub,
      dto.email,
      dto.role,
    );
  }

  @Post('accept-invite')
  @UseGuards(JwtAuthGuard)
  accept(@CurrentUser() user: JwtPayload, @Body() dto: AcceptInviteDto) {
    return this.membersService.acceptInvite(dto.token, user.sub);
  }

  @Patch(':id/role')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  updateRole(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateRoleDto,
  ) {
    return this.membersService.updateRole(
      user.organizationId,
      id,
      dto.role,
      user.role,
    );
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.membersService.removeMember(user.organizationId, id);
  }
}
