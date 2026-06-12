import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import axios from 'axios';
import {
  CloudStorageConnection,
  CloudStorageConnectionDocument,
  CloudProvider,
} from '../schemas/cloud-storage-connection.schema';
import { Document } from '../schemas/document.schema';
import { ConnectCloudStorageDto } from '../dto/connect-cloud-storage.dto';
import { ImportCloudFileDto } from '../dto/import-cloud-file.dto';
import { SaveOrgCloudCredentialsDto } from '../dto/save-org-cloud-credentials.dto';
import { OrgCloudCredentials, OrgCloudCredentialsDocument } from '../schemas/org-cloud-credentials.schema';

export interface CloudFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  webViewLink?: string;
  iconUrl?: string;
  isFolder: boolean;
  parentId?: string | null;
}

export interface AuthUrlResult {
  authUrl: string;
  state: string;
}

/** Resolved OAuth credentials — never leave this service */
interface OAuthCreds {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  /** true = came from org DB record, false = platform env vars */
  isOrgLevel: boolean;
}

export interface ProviderStatus {
  configured: boolean;
  label: string;
  isOrgLevel: boolean;  // org supplied their own OAuth app
  hasCredentials: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────

@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);

  constructor(
    @InjectModel(CloudStorageConnection.name)
    private readonly connectionModel: Model<CloudStorageConnectionDocument>,
    @InjectModel(OrgCloudCredentials.name)
    private readonly credentialsModel: Model<OrgCloudCredentialsDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<Document>,
    private readonly config: ConfigService,
  ) {}

  // ── Per-org credential management ─────────────────────────────────────────

  /**
   * Upsert OAuth app credentials for a provider scoped to this organisation.
   * Only Owner/Admin should call this — enforced at controller level.
   */
  async saveOrgCredentials(
    organizationId: string,
    userId: string,
    dto: SaveOrgCloudCredentialsDto,
  ): Promise<{ saved: boolean; provider: CloudProvider }> {
    const orgId = new Types.ObjectId(organizationId);
    const existing = await this.credentialsModel.findOne({
      organizationId: orgId,
      provider: dto.provider,
    });

    if (existing) {
      existing.clientId = dto.clientId;
      existing.clientSecret = dto.clientSecret;
      if (dto.tenantId !== undefined) existing.tenantId = dto.tenantId;
      if (dto.label     !== undefined) existing.label     = dto.label;
      existing.isActive = true;
      existing.lastModifiedBy = new Types.ObjectId(userId);
      await existing.save();
    } else {
      await this.credentialsModel.create({
        organizationId: orgId,
        provider:       dto.provider,
        clientId:       dto.clientId,
        clientSecret:   dto.clientSecret,
        tenantId:       dto.tenantId,
        label:          dto.label,
        isActive:       true,
        createdBy:      new Types.ObjectId(userId),
      });
    }

    return { saved: true, provider: dto.provider as CloudProvider };
  }

  /**
   * Return provider configuration status for this org.
   * NEVER exposes secrets — only whether each provider is ready to use.
   */
  async getProvidersConfig(
    organizationId: string,
  ): Promise<Record<CloudProvider, ProviderStatus>> {
    const orgId = new Types.ObjectId(organizationId);

    // Fetch all active org-level credential records (clientSecret excluded by select:false)
    const orgCreds = await this.credentialsModel
      .find({ organizationId: orgId, isActive: true })
      .select('provider clientId label')
      .lean();

    const orgMap = new Map(orgCreds.map(c => [c.provider as CloudProvider, c]));

    const resolve = (provider: CloudProvider, label: string): ProviderStatus => {
      const orgRecord = orgMap.get(provider);
      if (orgRecord) {
        return { configured: true, label, isOrgLevel: true, hasCredentials: true };
      }
      // Fall back to platform-level env vars
      const envKey = this.envClientIdKey(provider);
      const hasEnv = !!this.config.get<string>(envKey, '');
      return { configured: hasEnv, label, isOrgLevel: false, hasCredentials: hasEnv };
    };

    return {
      google_drive: resolve('google_drive', 'Google Drive'),
      dropbox:      resolve('dropbox',      'Dropbox'),
      sharepoint:   resolve('sharepoint',   'SharePoint / OneDrive'),
    };
  }

  /** Remove org-level credentials — falls back to env-var config (or unavailable). */
  async deleteOrgCredentials(
    organizationId: string,
    provider: CloudProvider,
  ): Promise<{ deleted: boolean }> {
    await this.credentialsModel.deleteOne({
      organizationId: new Types.ObjectId(organizationId),
      provider,
    });
    return { deleted: true };
  }

  // ── OAuth flow ─────────────────────────────────────────────────────────────

  async getAuthUrl(
    organizationId: string,
    provider: CloudProvider,
    redirectUri: string,
    state: string,
  ): Promise<AuthUrlResult> {
    const creds = await this.resolveCreds(organizationId, provider);
    switch (provider) {
      case 'google_drive': return this.googleAuthUrl(creds, redirectUri, state);
      case 'dropbox':      return this.dropboxAuthUrl(creds, redirectUri, state);
      case 'sharepoint':   return this.sharepointAuthUrl(creds, redirectUri, state);
      default: throw new BadRequestException(`Unknown provider: ${provider}`);
    }
  }

  private googleAuthUrl(creds: OAuthCreds, redirectUri: string, state: string): AuthUrlResult {
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');
    return {
      authUrl:
        `https://accounts.google.com/o/oauth2/v2/auth` +
        `?client_id=${encodeURIComponent(creds.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&access_type=offline&prompt=consent` +
        `&state=${encodeURIComponent(state)}`,
      state,
    };
  }

  private dropboxAuthUrl(creds: OAuthCreds, redirectUri: string, state: string): AuthUrlResult {
    return {
      authUrl:
        `https://www.dropbox.com/oauth2/authorize` +
        `?client_id=${encodeURIComponent(creds.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code&token_access_type=offline` +
        `&state=${encodeURIComponent(state)}`,
      state,
    };
  }

  private sharepointAuthUrl(creds: OAuthCreds, redirectUri: string, state: string): AuthUrlResult {
    const tenantId = creds.tenantId ?? 'common';
    const scopes = [
      'https://graph.microsoft.com/Files.Read.All',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ].join(' ');
    return {
      authUrl:
        `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
        `?client_id=${encodeURIComponent(creds.clientId)}` +
        `&redirect_uri=${encodeURIComponent(redirectUri)}` +
        `&response_type=code` +
        `&scope=${encodeURIComponent(scopes)}` +
        `&state=${encodeURIComponent(state)}`,
      state,
    };
  }

  // ── Token exchange ─────────────────────────────────────────────────────────

  async exchangeCode(
    organizationId: string,
    userId: string,
    dto: ConnectCloudStorageDto,
  ): Promise<CloudStorageConnectionDocument> {
    const creds = await this.resolveCreds(organizationId, dto.provider);

    let tokenData: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      accountMeta: Record<string, unknown>;
    };

    switch (dto.provider) {
      case 'google_drive':
        tokenData = await this.exchangeGoogleCode(creds, dto.code, dto.redirectUri);
        break;
      case 'dropbox':
        tokenData = await this.exchangeDropboxCode(creds, dto.code, dto.redirectUri, dto.codeVerifier);
        break;
      case 'sharepoint':
        tokenData = await this.exchangeSharepointCode(creds, dto.code, dto.redirectUri);
        break;
      default:
        throw new BadRequestException(`Unknown provider: ${dto.provider}`);
    }

    const label =
      dto.label ||
      `${this.providerLabel(dto.provider)} — ${(tokenData.accountMeta['email'] as string) ?? organizationId}`;

    return this.connectionModel.create({
      organizationId:    new Types.ObjectId(organizationId),
      connectedByUserId: new Types.ObjectId(userId),
      provider:          dto.provider,
      label,
      accessToken:  tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt:    tokenData.expiresAt,
      accountMeta:  tokenData.accountMeta,
      isActive:     true,
    });
  }

  private async exchangeGoogleCode(creds: OAuthCreds, code: string, redirectUri: string) {
    const resp = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number }>(
      'https://oauth2.googleapis.com/token',
      { code, client_id: creds.clientId, client_secret: creds.clientSecret, redirect_uri: redirectUri, grant_type: 'authorization_code' },
    );
    const meResp = await axios.get<{ email: string; name: string }>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${resp.data.access_token}` } },
    );
    return {
      accessToken:  resp.data.access_token,
      refreshToken: resp.data.refresh_token,
      expiresAt:    Date.now() + resp.data.expires_in * 1000,
      accountMeta:  { email: meResp.data.email, name: meResp.data.name },
    };
  }

  private async exchangeDropboxCode(
    creds: OAuthCreds, code: string, redirectUri: string, codeVerifier?: string,
  ) {
    const params: Record<string, string> = { code, grant_type: 'authorization_code', redirect_uri: redirectUri };
    if (codeVerifier) params['code_verifier'] = codeVerifier;
    const resp = await axios.post<{ access_token: string; refresh_token?: string; expires_in?: number; account_id?: string }>(
      'https://api.dropbox.com/oauth2/token', params,
      { auth: { username: creds.clientId, password: creds.clientSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const meResp = await axios.post<{ email: string; name: { display_name: string } }>(
      'https://api.dropboxapi.com/2/users/get_current_account', null,
      { headers: { Authorization: `Bearer ${resp.data.access_token}` } },
    );
    return {
      accessToken:  resp.data.access_token,
      refreshToken: resp.data.refresh_token,
      expiresAt:    resp.data.expires_in ? Date.now() + resp.data.expires_in * 1000 : undefined,
      accountMeta:  { accountId: resp.data.account_id, email: meResp.data.email, name: meResp.data.name?.display_name },
    };
  }

  private async exchangeSharepointCode(creds: OAuthCreds, code: string, redirectUri: string) {
    const tenantId = creds.tenantId ?? 'common';
    const params = new URLSearchParams({
      code, client_id: creds.clientId, client_secret: creds.clientSecret,
      redirect_uri: redirectUri, grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
    });
    const resp = await axios.post<{ access_token: string; refresh_token?: string; expires_in: number }>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );
    const meResp = await axios.get<{ displayName: string; userPrincipalName: string }>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${resp.data.access_token}` } },
    );
    return {
      accessToken:  resp.data.access_token,
      refreshToken: resp.data.refresh_token,
      expiresAt:    Date.now() + resp.data.expires_in * 1000,
      accountMeta:  { email: meResp.data.userPrincipalName, name: meResp.data.displayName },
    };
  }

  // ── Token refresh ──────────────────────────────────────────────────────────

  private async refreshAccessToken(conn: CloudStorageConnectionDocument): Promise<string> {
    if (!conn.refreshToken) {
      throw new UnauthorizedException('No refresh token — please reconnect this account.');
    }
    if (conn.expiresAt && conn.expiresAt > Date.now() + 60_000) {
      return conn.accessToken; // still valid
    }

    const creds = await this.resolveCreds(conn.organizationId.toString(), conn.provider);

    try {
      let newToken: string;
      let newExpiresAt: number | undefined;

      if (conn.provider === 'google_drive') {
        const resp = await axios.post<{ access_token: string; expires_in: number }>(
          'https://oauth2.googleapis.com/token',
          { client_id: creds.clientId, client_secret: creds.clientSecret, refresh_token: conn.refreshToken, grant_type: 'refresh_token' },
        );
        newToken     = resp.data.access_token;
        newExpiresAt = Date.now() + resp.data.expires_in * 1000;

      } else if (conn.provider === 'dropbox') {
        const resp = await axios.post<{ access_token: string; expires_in?: number }>(
          'https://api.dropbox.com/oauth2/token',
          `grant_type=refresh_token&refresh_token=${conn.refreshToken}`,
          { auth: { username: creds.clientId, password: creds.clientSecret }, headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
        newToken     = resp.data.access_token;
        newExpiresAt = resp.data.expires_in ? Date.now() + resp.data.expires_in * 1000 : undefined;

      } else {
        const tenantId = creds.tenantId ?? 'common';
        const params = new URLSearchParams({
          client_id: creds.clientId, client_secret: creds.clientSecret,
          refresh_token: conn.refreshToken, grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
        });
        const resp = await axios.post<{ access_token: string; expires_in: number }>(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          params.toString(), { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
        newToken     = resp.data.access_token;
        newExpiresAt = Date.now() + resp.data.expires_in * 1000;
      }

      await this.connectionModel.updateOne({ _id: conn._id }, { accessToken: newToken, expiresAt: newExpiresAt });
      return newToken;

    } catch (err) {
      this.logger.error(`Token refresh failed for connection ${String(conn._id)}`, err);
      throw new UnauthorizedException('Cloud token refresh failed — please reconnect.');
    }
  }

  // ── Connections CRUD ───────────────────────────────────────────────────────

  findConnections(organizationId: string) {
    return this.connectionModel
      .find({ organizationId: new Types.ObjectId(organizationId), isActive: true })
      .select('-accessToken -refreshToken')
      .sort({ createdAt: -1 })
      .lean();
  }

  async removeConnection(organizationId: string, connectionId: string) {
    const result = await this.connectionModel.findOneAndUpdate(
      { _id: connectionId, organizationId: new Types.ObjectId(organizationId) },
      { isActive: false },
    );
    if (!result) throw new NotFoundException('Connection not found');
    return { deleted: true };
  }

  // ── List files ─────────────────────────────────────────────────────────────

  async listFiles(
    organizationId: string,
    connectionId: string,
    folderId?: string,
    search?: string,
  ): Promise<CloudFile[]> {
    const conn  = await this.getConnection(organizationId, connectionId);
    const token = await this.refreshAccessToken(conn);
    switch (conn.provider) {
      case 'google_drive': return this.listGoogleFiles(token, folderId, search);
      case 'dropbox':      return this.listDropboxFiles(token, folderId, search);
      case 'sharepoint':   return this.listSharepointFiles(token, folderId, search);
    }
  }

  private async listGoogleFiles(token: string, folderId?: string, search?: string): Promise<CloudFile[]> {
    type GDriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; iconLink?: string; parents?: string[] };
    const parts: string[] = ['trashed=false'];
    if (folderId)     parts.push(`'${folderId}' in parents`);
    else if (!search) parts.push(`'root' in parents`);
    if (search) parts.push(`name contains '${search}'`);
    const resp = await axios.get<{ files: GDriveFile[] }>(
      'https://www.googleapis.com/drive/v3/files',
      { headers: { Authorization: `Bearer ${token}` }, params: { q: parts.join(' and '), fields: 'files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,parents)', pageSize: 100, orderBy: 'folder,name' } },
    );
    return resp.data.files.map((f: GDriveFile) => ({
      id: f.id, name: f.name, mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : undefined,
      modifiedAt: f.modifiedTime, webViewLink: f.webViewLink, iconUrl: f.iconLink,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      parentId: f.parents?.[0] ?? null,
    }));
  }

  private async listDropboxFiles(token: string, folderId?: string, search?: string): Promise<CloudFile[]> {
    type DropboxMatch  = { metadata: { metadata: { id: string; name: string; '.tag': string; size?: number; server_modified?: string; preview_url?: string; path_display?: string } } };
    type DropboxEntry  = { '.tag': string; id: string; name: string; size?: number; server_modified?: string; preview_url?: string; path_display?: string };
    if (search) {
      const resp = await axios.post<{ matches: DropboxMatch[] }>(
        'https://api.dropboxapi.com/2/files/search_v2',
        { query: search, options: { max_results: 100 } },
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return resp.data.matches.map((m: DropboxMatch) => {
        const f = m.metadata.metadata;
        return { id: f.id || f.path_display || '', name: f.name, size: f.size, modifiedAt: f.server_modified, webViewLink: f.preview_url, isFolder: f['.tag'] === 'folder', parentId: null };
      });
    }
    const path = folderId && folderId !== 'root' ? folderId : '';
    const resp = await axios.post<{ entries: DropboxEntry[] }>(
      'https://api.dropboxapi.com/2/files/list_folder',
      { path, limit: 200 },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return resp.data.entries.map((f: DropboxEntry) => ({
      id: f.id || f.path_display || '', name: f.name, size: f.size,
      modifiedAt: f.server_modified, webViewLink: f.preview_url,
      isFolder: f['.tag'] === 'folder', parentId: folderId ?? null,
    }));
  }

  private async listSharepointFiles(token: string, folderId?: string, search?: string): Promise<CloudFile[]> {
    type SPItem = { id: string; name: string; file?: { mimeType: string }; folder?: object; size?: number; lastModifiedDateTime?: string; webUrl?: string; parentReference?: { id: string } };
    let url: string;
    if (search) {
      url = `https://graph.microsoft.com/v1.0/me/drive/root/search(q='${encodeURIComponent(search)}')` +
        `?select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference`;
    } else if (folderId && folderId !== 'root') {
      url = `https://graph.microsoft.com/v1.0/me/drive/items/${folderId}/children` +
        `?select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference&$orderby=name asc`;
    } else {
      url = `https://graph.microsoft.com/v1.0/me/drive/root/children` +
        `?select=id,name,file,folder,size,lastModifiedDateTime,webUrl,parentReference&$orderby=name asc`;
    }
    const resp = await axios.get<{ value: SPItem[] }>(url, { headers: { Authorization: `Bearer ${token}` } });
    return resp.data.value.map((f: SPItem) => ({
      id: f.id, name: f.name, mimeType: f.file?.mimeType, size: f.size,
      modifiedAt: f.lastModifiedDateTime, webViewLink: f.webUrl,
      isFolder: !!f.folder, parentId: f.parentReference?.id ?? null,
    }));
  }

  // ── Import file ────────────────────────────────────────────────────────────

  async importFile(organizationId: string, userId: string, dto: ImportCloudFileDto): Promise<Document> {
    const conn    = await this.getConnection(organizationId, dto.connectionId);
    let fileUrl   = dto.fileUrl;
    if (!fileUrl) {
      const token = await this.refreshAccessToken(conn);
      fileUrl     = await this.resolveFileUrl(conn.provider, token, dto.fileId);
    }
    return this.documentModel.create({
      organizationId:    new Types.ObjectId(organizationId),
      createdByUserId:   new Types.ObjectId(userId),
      projectId:         dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      title:             dto.fileName,
      description:       `Imported from ${this.providerLabel(conn.provider)}`,
      category:          dto.category ?? 'Other',
      storageKey:        `cloud:${conn.provider}:${dto.fileId}`,
      fileUrl,
      tags:              [conn.provider.replace('_', '-'), 'imported'],
    });
  }

  private async resolveFileUrl(provider: CloudProvider, token: string, fileId: string): Promise<string> {
    if (provider === 'google_drive') {
      const resp = await axios.get<{ webViewLink: string }>(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=webViewLink`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return resp.data.webViewLink;
    }
    if (provider === 'sharepoint') {
      const resp = await axios.get<{ webUrl: string }>(
        `https://graph.microsoft.com/v1.0/me/drive/items/${fileId}?select=webUrl`,
        { headers: { Authorization: `Bearer ${token}` } },
      );
      return resp.data.webUrl;
    }
    const resp = await axios.post<{ link: string }>(
      'https://api.dropboxapi.com/2/files/get_temporary_link',
      { path: fileId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return resp.data.link;
  }

  // ── Core credential resolution ─────────────────────────────────────────────

  /**
   * Priority: 1) Org-level DB record → 2) Platform env vars → throw.
   *
   * This makes every org fully independent — they can bring their own
   * Google/Dropbox/Microsoft OAuth app and it works seamlessly.
   * Env vars remain as a platform-level fallback for shared deployments.
   */
  private async resolveCreds(organizationId: string, provider: CloudProvider): Promise<OAuthCreds> {
    // 1. Org-level: re-select clientSecret which has select:false by default
    const orgCred = await this.credentialsModel
      .findOne({ organizationId: new Types.ObjectId(organizationId), provider, isActive: true })
      .select('+clientSecret')
      .lean();

    if (orgCred) {
      return {
        clientId:     orgCred.clientId,
        clientSecret: orgCred.clientSecret,
        tenantId:     orgCred.tenantId,
        isOrgLevel:   true,
      };
    }

    // 2. Platform env-var fallback
    const clientId     = this.config.get<string>(this.envClientIdKey(provider), '');
    const clientSecret = this.config.get<string>(this.envClientSecretKey(provider), '');
    const tenantId     = provider === 'sharepoint'
      ? this.config.get<string>('SHAREPOINT_TENANT_ID', 'common')
      : undefined;

    if (!clientId || !clientSecret) {
      throw new BadRequestException(
        `${this.providerLabel(provider)} is not configured for your organisation. ` +
        `Go to Settings → Cloud Storage to enter your OAuth app credentials.`,
      );
    }

    return { clientId, clientSecret, tenantId, isOrgLevel: false };
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  private envClientIdKey(provider: CloudProvider): string {
    return { google_drive: 'GOOGLE_CLIENT_ID', dropbox: 'DROPBOX_CLIENT_ID', sharepoint: 'SHAREPOINT_CLIENT_ID' }[provider];
  }

  private envClientSecretKey(provider: CloudProvider): string {
    return { google_drive: 'GOOGLE_CLIENT_SECRET', dropbox: 'DROPBOX_CLIENT_SECRET', sharepoint: 'SHAREPOINT_CLIENT_SECRET' }[provider];
  }

  private providerLabel(provider: CloudProvider): string {
    return { google_drive: 'Google Drive', dropbox: 'Dropbox', sharepoint: 'SharePoint' }[provider];
  }

  private async getConnection(organizationId: string, connectionId: string): Promise<CloudStorageConnectionDocument> {
    const conn = await this.connectionModel.findOne({
      _id: connectionId,
      organizationId: new Types.ObjectId(organizationId),
      isActive: true,
    });
    if (!conn) throw new NotFoundException('Cloud storage connection not found');
    return conn;
  }
}