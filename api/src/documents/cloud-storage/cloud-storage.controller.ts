import {
  Body, Controller, Delete, Get, Param,
  Post, Put, Query, UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { SubscriptionGuard } from '../../common/guards/subscription.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { PERMISSIONS, OrgRole } from '../../common/constants/roles';
import type { JwtPayload } from '../../common/types/jwt-payload';
import { ConnectCloudStorageDto } from '../dto/connect-cloud-storage.dto';
import { ImportCloudFileDto } from '../dto/import-cloud-file.dto';
import { CloudProvider } from '../schemas/cloud-storage-connection.schema';
import { CloudStorageService } from './cloud-storage.service';
import { SaveOrgCloudCredentialsDto } from '../dto/save-org-cloud-credentials.dto';

@Controller('documents/cloud')
@UseGuards(JwtAuthGuard, SubscriptionGuard, RolesGuard)
export class CloudStorageController {
  constructor(private readonly cloudService: CloudStorageService) {}

  // ── Per-org OAuth app credential management ──────────────────────────────

  /**
   * GET /documents/cloud/providers-config
   * Returns which providers are configured for this org — no secrets exposed.
   * Used by the UI to show "Connected" / "Setup required".
   */
  @Get('providers-config')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  getProvidersConfig(@CurrentUser() user: JwtPayload) {
    return this.cloudService.getProvidersConfig(user.organizationId);
  }

  /**
   * PUT /documents/cloud/org-credentials
   * Save OAuth app credentials (clientId + clientSecret) for a provider,
   * scoped to this organisation. Owner / Admin only.
   *
   * Each org registers their own OAuth app with Google/Dropbox/Microsoft —
   * credentials are stored encrypted in MongoDB, never in env vars.
   */
  @Put('org-credentials')
  @Roles(OrgRole.OWNER, OrgRole.ADMIN)
  saveOrgCredentials(
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveOrgCloudCredentialsDto,
  ) {
    return this.cloudService.saveOrgCredentials(user.organizationId, user.sub, dto);
  }

  /**
   * DELETE /documents/cloud/org-credentials/:provider
   * Remove org-level credentials — reverts to platform env-var fallback.
   * Owner only.
   */
  @Delete('org-credentials/:provider')
  @Roles(OrgRole.OWNER)
  deleteOrgCredentials(
    @CurrentUser() user: JwtPayload,
    @Param('provider') provider: CloudProvider,
  ) {
    return this.cloudService.deleteOrgCredentials(user.organizationId, provider);
  }

  // ── OAuth flow ─────────────────────────────────────────────────────────────

  /**
   * GET /documents/cloud/auth-url?provider=google_drive&redirectUri=…&state=xyz
   * Returns the OAuth authorization URL. Credentials resolved per-org from DB.
   */
  @Get('auth-url')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  getAuthUrl(
    @CurrentUser() user: JwtPayload,
    @Query('provider') provider: CloudProvider,
    @Query('redirectUri') redirectUri: string,
    @Query('state') state: string,
  ) {
    return this.cloudService.getAuthUrl(
      user.organizationId, provider, redirectUri, state ?? 'evidara',
    );
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

  // ── Connections ────────────────────────────────────────────────────────────

  @Get('connections')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  listConnections(@CurrentUser() user: JwtPayload) {
    return this.cloudService.findConnections(user.organizationId);
  }

  @Delete('connections/:id')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  removeConnection(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.cloudService.removeConnection(user.organizationId, id);
  }

  // ── Files ──────────────────────────────────────────────────────────────────

  @Get('files/:connectionId')
  @Roles(...PERMISSIONS.VIEW_DOCUMENTS)
  listFiles(
    @CurrentUser() user: JwtPayload,
    @Param('connectionId') connectionId: string,
    @Query('folderId') folderId?: string,
    @Query('search') search?: string,
  ) {
    return this.cloudService.listFiles(user.organizationId, connectionId, folderId, search);
  }

  @Post('import')
  @Roles(...PERMISSIONS.MANAGE_DOCUMENTS)
  importFile(@CurrentUser() user: JwtPayload, @Body() dto: ImportCloudFileDto) {
    return this.cloudService.importFile(user.organizationId, user.sub, dto);
  }
}