import { Body, Controller, Get, Param, Post, Delete, Patch, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PERMISSIONS } from '../common/constants/roles';
import { OrgRole } from '../common/constants/roles';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { FormsService } from './forms.service';
import type { JwtPayload } from '../common/types/jwt-payload';
import { CreateFormTemplateDto } from './dto/create-form-template.dto';
import { UpdateFormTemplateDto } from './dto/update-form-template.dto';
import { CreateFormResponseDto } from './dto/create-form-response.dto';

@Controller('forms')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class FormsController {
  constructor(private readonly formsService: FormsService) {}

  @Get('templates')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  findTemplates(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.formsService.findTemplates(user.organizationId, projectId);
  }

  @Get('templates/:id')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  findTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.formsService.findTemplate(user.organizationId, id);
  }

  @Post('templates')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  createTemplate(@CurrentUser() user: JwtPayload, @Body() dto: CreateFormTemplateDto) {
    return this.formsService.createTemplate(user.organizationId, dto);
  }

  @Patch('templates/:id')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  updateTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string, @Body() dto: UpdateFormTemplateDto) {
    return this.formsService.updateTemplate(user.organizationId, id, dto);
  }

  @Delete('templates/:id')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN, OrgRole.ME_OFFICER)
  removeTemplate(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.formsService.removeTemplate(user.organizationId, id);
  }

  @Get('responses')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  findResponses(@CurrentUser() user: JwtPayload, @Query('projectId') projectId?: string) {
    return this.formsService.findResponses(user.organizationId, projectId);
  }

  @Get('responses/:id')
  @Roles(...PERMISSIONS.VIEW_DATA_COLLECTION)
  findResponse(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.formsService.findResponse(user.organizationId, id);
  }

  @Post('responses')
  @Roles(...PERMISSIONS.MANAGE_DATA_COLLECTION)
  createResponse(@CurrentUser() user: JwtPayload, @Body() dto: CreateFormResponseDto) {
    return this.formsService.createResponse(user.organizationId, dto, user.sub);
  }
}