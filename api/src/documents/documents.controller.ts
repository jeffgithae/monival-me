import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { SubscriptionGuard } from '../common/guards/subscription.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CreateDocumentDto } from './dto/create-document.dto';
import { CreateDocumentVersionDto } from './dto/create-document-version.dto';
import { UpdateDocumentDto } from './dto/update-document.dto';
import { DocumentsService } from './documents.service';
import { PERMISSIONS } from '../common/constants/roles';
import type { JwtPayload } from '../common/types/jwt-payload';

@Controller('documents')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Get()
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  findDocuments(
    @CurrentUser() user: JwtPayload,
    @Query('projectId') projectId?: string,
    @Query('category')  category?: string,
    @Query('search')    search?: string,
    @Query('page')      page?: string,
    @Query('limit')     limit?: string,
  ) {
    return this.documentsService.findDocuments(user.organizationId, {
      projectId, category, search,
      page:  page  ? parseInt(page,  10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
  }

  @Get(':id')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  findDocument(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documentsService.findDocument(user.organizationId, id);
  }

  @Post()
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  createDocument(@CurrentUser() user: JwtPayload, @Body() dto: CreateDocumentDto) {
    return this.documentsService.createDocument(user.organizationId, dto, user.sub);
  }

  @Patch(':id')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  updateDocument(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: UpdateDocumentDto,
  ) {
    return this.documentsService.updateDocument(user.organizationId, id, dto);
  }

  @Delete(':id')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  removeDocument(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documentsService.removeDocument(user.organizationId, id);
  }

  @Get(':id/versions')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  findVersions(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documentsService.findDocumentVersions(user.organizationId, id);
  }

  @Post(':id/versions')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  createVersion(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateDocumentVersionDto,
  ) {
    return this.documentsService.createDocumentVersion(user.organizationId, id, dto, user.sub);
  }
}