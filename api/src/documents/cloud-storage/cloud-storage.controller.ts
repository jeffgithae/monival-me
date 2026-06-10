import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS } from '../../common/constants/roles';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { CloudStorageService } from './cloud-storage.service';
import { ConnectCloudStorageDto } from './dto/connect-cloud-storage.dto';
import { ImportCloudFileDto } from './dto/import-cloud-file.dto';
import type { CloudProvider } from './dto/connect-cloud-storage.dto';

@Controller('documents/cloud')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class CloudStorageController {
  constructor(private readonly cloudService: CloudStorageService) {}

  /**
   * GET /documents/cloud/auth-url?provider=google_drive&redirectUri=https://…&state=xyz
   * Returns the OAuth authorization URL to redirect the user to.
   */
  @Get('auth-url')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  getAuthUrl(
    @Query('provider') provider: CloudProvider,
    @Query('redirectUri') redirectUri: string,
    @Query('state') state: string,
  ) {
    return this.cloudService.getAuthUrl(provider, redirectUri, state ?? 'monival');
  }

  /**
   * POST /documents/cloud/connect
   * Exchange an OAuth code for tokens and persist the connection.
   */
  @Post('connect')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  connect(@CurrentUser() user: JwtPayload, @Body() dto: ConnectCloudStorageDto) {
    return this.cloudService.exchangeCode(user.organizationId, user.sub, dto);
  }

  /**
   * GET /documents/cloud/connections
   * List all active cloud storage connections for this organisation.
   */
  @Get('connections')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  listConnections(@CurrentUser() user: JwtPayload) {
    return this.cloudService.findConnections(user.organizationId);
  }

  /**
   * DELETE /documents/cloud/connections/:id
   * Deactivate (soft-delete) a cloud storage connection.
   */
  @Delete('connections/:id')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  removeConnection(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.cloudService.removeConnection(user.organizationId, id);
  }

  /**
   * GET /documents/cloud/files/:connectionId?folderId=…&search=…
   * Browse files in the connected provider.
   */
  @Get('files/:connectionId')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  listFiles(
    @CurrentUser() user: JwtPayload,
    @Param('connectionId') connectionId: string,
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
  ) {
    return this.cloudService.listFiles(
      user.organizationId,
      connectionId,
      folderId,
      search,
    );
  }

  /**
   * POST /documents/cloud/import
   * Import a cloud file as a Monival document record.
   */
  @Post('import')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  importFile(@CurrentUser() user: JwtPayload, @Body() dto: ImportCloudFileDto) {
    return this.cloudService.importFile(user.organizationId, user.sub, dto);
  }
}