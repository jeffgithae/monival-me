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
import { ConnectCloudStorageDto } from './dto/connect-cloud-storage.dto';
import { ImportCloudFileDto } from './dto/import-cloud-file.dto';

// ─── Shape returned by listFiles ─────────────────────────────────────────────
export interface CloudFile {
  id: string;
  name: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
  webViewLink?: string;       // direct link to open in browser
  iconUrl?: string;
  isFolder: boolean;
  parentId?: string | null;
}

// ─── Shape returned by getAuthUrl ────────────────────────────────────────────
export interface AuthUrlResult {
  authUrl: string;
  state: string;
}

@Injectable()
export class CloudStorageService {
  private readonly logger = new Logger(CloudStorageService.name);

  constructor(
    @InjectModel(CloudStorageConnection.name)
    private readonly connectionModel: Model<CloudStorageConnectionDocument>,
    @InjectModel(Document.name)
    private readonly documentModel: Model<Document>,
    private readonly config: ConfigService,
  ) {}

  // ─── Auth URL ──────────────────────────────────────────────────────────────

  getAuthUrl(provider: CloudProvider, redirectUri: string, state: string): AuthUrlResult {
    switch (provider) {
      case 'google_drive':
        return this.googleAuthUrl(redirectUri, state);
      case 'dropbox':
        return this.dropboxAuthUrl(redirectUri, state);
      case 'sharepoint':
        return this.sharepointAuthUrl(redirectUri, state);
      default:
        throw new BadRequestException(`Unknown provider: ${provider}`);
    }
  }

  private googleAuthUrl(redirectUri: string, state: string): AuthUrlResult {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');
    const scopes = [
      'https://www.googleapis.com/auth/drive.readonly',
      'https://www.googleapis.com/auth/userinfo.email',
    ].join(' ');
    const authUrl =
      `https://accounts.google.com/o/oauth2/v2/auth` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&access_type=offline` +
      `&prompt=consent` +
      `&state=${encodeURIComponent(state)}`;
    return { authUrl, state };
  }

  private dropboxAuthUrl(redirectUri: string, state: string): AuthUrlResult {
    const clientId = this.config.get<string>('DROPBOX_CLIENT_ID', '');
    const authUrl =
      `https://www.dropbox.com/oauth2/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&token_access_type=offline` +
      `&state=${encodeURIComponent(state)}`;
    return { authUrl, state };
  }

  private sharepointAuthUrl(redirectUri: string, state: string): AuthUrlResult {
    const clientId = this.config.get<string>('SHAREPOINT_CLIENT_ID', '');
    const tenantId = this.config.get<string>('SHAREPOINT_TENANT_ID', 'common');
    const scopes = [
      'https://graph.microsoft.com/Files.Read.All',
      'https://graph.microsoft.com/User.Read',
      'offline_access',
    ].join(' ');
    const authUrl =
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/authorize` +
      `?client_id=${encodeURIComponent(clientId)}` +
      `&redirect_uri=${encodeURIComponent(redirectUri)}` +
      `&response_type=code` +
      `&scope=${encodeURIComponent(scopes)}` +
      `&state=${encodeURIComponent(state)}`;
    return { authUrl, state };
  }

  // ─── Token Exchange ────────────────────────────────────────────────────────

  async exchangeCode(
    organizationId: string,
    userId: string,
    dto: ConnectCloudStorageDto,
  ): Promise<CloudStorageConnectionDocument> {
    let tokenData: {
      accessToken: string;
      refreshToken?: string;
      expiresAt?: number;
      accountMeta: Record<string, unknown>;
    };

    switch (dto.provider) {
      case 'google_drive':
        tokenData = await this.exchangeGoogleCode(dto.code, dto.redirectUri);
        break;
      case 'dropbox':
        tokenData = await this.exchangeDropboxCode(dto.code, dto.redirectUri, dto.codeVerifier);
        break;
      case 'sharepoint':
        tokenData = await this.exchangeSharepointCode(dto.code, dto.redirectUri);
        break;
      default:
        throw new BadRequestException(`Unknown provider: ${dto.provider}`);
    }

    const label = dto.label || `${this.providerLabel(dto.provider)} — ${(tokenData.accountMeta['email'] as string) ?? organizationId}`;

    const connection = await this.connectionModel.create({
      organizationId: new Types.ObjectId(organizationId),
      connectedByUserId: new Types.ObjectId(userId),
      provider: dto.provider,
      label,
      accessToken: tokenData.accessToken,
      refreshToken: tokenData.refreshToken,
      expiresAt: tokenData.expiresAt,
      accountMeta: tokenData.accountMeta,
      isActive: true,
    });

    return connection;
  }

  private async exchangeGoogleCode(code: string, redirectUri: string) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET', '');
    const resp = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
      token_type: string;
    }>('https://oauth2.googleapis.com/token', {
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
    const { access_token, refresh_token, expires_in } = resp.data;

    // Fetch user info
    const meResp = await axios.get<{ email: string; name: string }>(
      'https://www.googleapis.com/oauth2/v2/userinfo',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      accountMeta: { email: meResp.data.email, name: meResp.data.name },
    };
  }

  private async exchangeDropboxCode(code: string, redirectUri: string, codeVerifier?: string) {
    const clientId = this.config.get<string>('DROPBOX_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('DROPBOX_CLIENT_SECRET', '');
    const params: Record<string, string> = {
      code,
      grant_type: 'authorization_code',
      redirect_uri: redirectUri,
    };
    if (codeVerifier) params['code_verifier'] = codeVerifier;

    const resp = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in?: number;
      account_id?: string;
    }>('https://api.dropbox.com/oauth2/token', params, {
      auth: { username: clientId, password: clientSecret },
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in, account_id } = resp.data;
    // Fetch account info
    const meResp = await axios.post<{ email: string; name: { display_name: string } }>(
      'https://api.dropboxapi.com/2/users/get_current_account',
      null,
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: expires_in ? Date.now() + expires_in * 1000 : undefined,
      accountMeta: {
        accountId: account_id,
        email: meResp.data.email,
        name: meResp.data.name?.display_name,
      },
    };
  }

  private async exchangeSharepointCode(code: string, redirectUri: string) {
    const clientId = this.config.get<string>('SHAREPOINT_CLIENT_ID', '');
    const clientSecret = this.config.get<string>('SHAREPOINT_CLIENT_SECRET', '');
    const tenantId = this.config.get<string>('SHAREPOINT_TENANT_ID', 'common');

    const params = new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
    });

    const resp = await axios.post<{
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    }>(
      `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
    );

    const { access_token, refresh_token, expires_in } = resp.data;

    // Fetch user info via Graph
    const meResp = await axios.get<{ displayName: string; userPrincipalName: string }>(
      'https://graph.microsoft.com/v1.0/me',
      { headers: { Authorization: `Bearer ${access_token}` } },
    );

    return {
      accessToken: access_token,
      refreshToken: refresh_token,
      expiresAt: Date.now() + expires_in * 1000,
      accountMeta: {
        email: meResp.data.userPrincipalName,
        name: meResp.data.displayName,
      },
    };
  }

  // ─── Token Refresh ─────────────────────────────────────────────────────────

  private async refreshAccessToken(conn: CloudStorageConnectionDocument): Promise<string> {
    if (!conn.refreshToken) {
      throw new UnauthorizedException('No refresh token — please reconnect this account.');
    }
    if (conn.expiresAt && conn.expiresAt > Date.now() + 60_000) {
      return conn.accessToken; // still valid for > 1 min
    }

    try {
      let newAccessToken: string;
      let newExpiresAt: number | undefined;

      if (conn.provider === 'google_drive') {
        const clientId = this.config.get<string>('GOOGLE_CLIENT_ID', '');
        const clientSecret = this.config.get<string>('GOOGLE_CLIENT_SECRET', '');
        const resp = await axios.post<{ access_token: string; expires_in: number }>(
          'https://oauth2.googleapis.com/token',
          {
            client_id: clientId,
            client_secret: clientSecret,
            refresh_token: conn.refreshToken,
            grant_type: 'refresh_token',
          },
        );
        newAccessToken = resp.data.access_token;
        newExpiresAt = Date.now() + resp.data.expires_in * 1000;
      } else if (conn.provider === 'dropbox') {
        const clientId = this.config.get<string>('DROPBOX_CLIENT_ID', '');
        const clientSecret = this.config.get<string>('DROPBOX_CLIENT_SECRET', '');
        const resp = await axios.post<{ access_token: string; expires_in?: number }>(
          'https://api.dropbox.com/oauth2/token',
          `grant_type=refresh_token&refresh_token=${conn.refreshToken}`,
          {
            auth: { username: clientId, password: clientSecret },
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          },
        );
        newAccessToken = resp.data.access_token;
        newExpiresAt = resp.data.expires_in ? Date.now() + resp.data.expires_in * 1000 : undefined;
      } else {
        // SharePoint / Microsoft Graph
        const clientId = this.config.get<string>('SHAREPOINT_CLIENT_ID', '');
        const clientSecret = this.config.get<string>('SHAREPOINT_CLIENT_SECRET', '');
        const tenantId = this.config.get<string>('SHAREPOINT_TENANT_ID', 'common');
        const params = new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          refresh_token: conn.refreshToken,
          grant_type: 'refresh_token',
          scope: 'https://graph.microsoft.com/Files.Read.All offline_access',
        });
        const resp = await axios.post<{ access_token: string; expires_in: number }>(
          `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
          params.toString(),
          { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } },
        );
        newAccessToken = resp.data.access_token;
        newExpiresAt = Date.now() + resp.data.expires_in * 1000;
      }

      await this.connectionModel.updateOne(
        { _id: conn._id },
        { accessToken: newAccessToken, expiresAt: newExpiresAt },
      );
      return newAccessToken;
    } catch (err) {
      this.logger.error(`Token refresh failed for connection ${conn._id}`, err);
      throw new UnauthorizedException('Cloud storage token refresh failed — please reconnect.');
    }
  }

  // ─── List Connections ──────────────────────────────────────────────────────

  findConnections(organizationId: string) {
    return this.connectionModel
      .find({ organizationId: new Types.ObjectId(organizationId), isActive: true })
      .select('-accessToken -refreshToken') // never leak tokens to client
      .sort({ createdAt: -1 })
      .lean();
  }

  async removeConnection(organizationId: string, connectionId: string): Promise<{ deleted: boolean }> {
    const result = await this.connectionModel.findOneAndUpdate(
      { _id: connectionId, organizationId: new Types.ObjectId(organizationId) },
      { isActive: false },
    );
    if (!result) throw new NotFoundException('Connection not found');
    return { deleted: true };
  }

  // ─── List Files ───────────────────────────────────────────────────────────

  async listFiles(
    organizationId: string,
    connectionId: string,
    folderId?: string,
    search?: string,
  ): Promise<CloudFile[]> {
    const conn = await this.getConnection(organizationId, connectionId);
    const token = await this.refreshAccessToken(conn);

    switch (conn.provider) {
      case 'google_drive':
        return this.listGoogleFiles(token, folderId, search);
      case 'dropbox':
        return this.listDropboxFiles(token, folderId, search);
      case 'sharepoint':
        return this.listSharepointFiles(token, folderId, search);
    }
  }

  private async listGoogleFiles(
    token: string,
    folderId?: string,
    search?: string,
  ): Promise<CloudFile[]> {
    const parts: string[] = ["trashed=false"];
    if (folderId) {
      parts.push(`'${folderId}' in parents`);
    } else if (!search) {
      parts.push(`'root' in parents`);
    }
    if (search) parts.push(`name contains '${search}'`);

    const q = parts.join(' and ');
    const fields =
      'files(id,name,mimeType,size,modifiedTime,webViewLink,iconLink,parents)';

    const resp = await axios.get<{
      files: Array<{
        id: string;
        name: string;
        mimeType: string;
        size?: string;
        modifiedTime?: string;
        webViewLink?: string;
        iconLink?: string;
        parents?: string[];
      }>;
    }>('https://www.googleapis.com/drive/v3/files', {
      headers: { Authorization: `Bearer ${token}` },
      params: { q, fields, pageSize: 100, orderBy: 'folder,name' },
    });

    type GDriveFile = { id: string; name: string; mimeType: string; size?: string; modifiedTime?: string; webViewLink?: string; iconLink?: string; parents?: string[] };
    return resp.data.files.map((f: GDriveFile) => ({
      id: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: f.size ? parseInt(f.size, 10) : undefined,
      modifiedAt: f.modifiedTime,
      webViewLink: f.webViewLink,
      iconUrl: f.iconLink,
      isFolder: f.mimeType === 'application/vnd.google-apps.folder',
      parentId: f.parents?.[0] ?? null,
    }));
  }

  private async listDropboxFiles(
    token: string,
    folderId?: string,
    search?: string,
  ): Promise<CloudFile[]> {
    if (search) {
      const resp = await axios.post<{
        matches: Array<{
          metadata: {
            metadata: {
              id: string;
              name: string;
              '.tag': string;
              size?: number;
              server_modified?: string;
              preview_url?: string;
              path_display?: string;
            };
          };
        }>;
      }>(
        'https://api.dropboxapi.com/2/files/search_v2',
        { query: search, options: { max_results: 100 } },
        { headers: { Authorization: `Bearer ${token}` } },
      );

      type DropboxMatch = { metadata: { metadata: { id: string; name: string; '.tag': string; size?: number; server_modified?: string; preview_url?: string; path_display?: string } } };
      return resp.data.matches.map((m: DropboxMatch) => {
        const f = m.metadata.metadata;
        return {
          id: f.id || f.path_display || '',
          name: f.name,
          mimeType: undefined,
          size: f.size,
          modifiedAt: f.server_modified,
          webViewLink: f.preview_url,
          isFolder: f['.tag'] === 'folder',
          parentId: null,
        };
      });
    }

    const path = folderId && folderId !== 'root' ? folderId : '';
    const resp = await axios.post<{
      entries: Array<{
        '.tag': string;
        id: string;
        name: string;
        size?: number;
        server_modified?: string;
        preview_url?: string;
        path_display?: string;
      }>;
    }>(
      'https://api.dropboxapi.com/2/files/list_folder',
      { path, limit: 200 },
      { headers: { Authorization: `Bearer ${token}` } },
    );

    type DropboxEntry = { '.tag': string; id: string; name: string; size?: number; server_modified?: string; preview_url?: string; path_display?: string };
    return resp.data.entries.map((f: DropboxEntry) => ({
      id: f.id || f.path_display || '',
      name: f.name,
      mimeType: undefined,
      size: f.size,
      modifiedAt: f.server_modified,
      webViewLink: f.preview_url,
      isFolder: f['.tag'] === 'folder',
      parentId: folderId ?? null,
    }));
  }

  private async listSharepointFiles(
    token: string,
    folderId?: string,
    search?: string,
  ): Promise<CloudFile[]> {
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

    const resp = await axios.get<{
      value: Array<{
        id: string;
        name: string;
        file?: { mimeType: string };
        folder?: object;
        size?: number;
        lastModifiedDateTime?: string;
        webUrl?: string;
        parentReference?: { id: string };
      }>;
    }>(url, { headers: { Authorization: `Bearer ${token}` } });

    type SPItem = { id: string; name: string; file?: { mimeType: string }; folder?: object; size?: number; lastModifiedDateTime?: string; webUrl?: string; parentReference?: { id: string } };
    return resp.data.value.map((f: SPItem) => ({
      id: f.id,
      name: f.name,
      mimeType: f.file?.mimeType,
      size: f.size,
      modifiedAt: f.lastModifiedDateTime,
      webViewLink: f.webUrl,
      isFolder: !!f.folder,
      parentId: f.parentReference?.id ?? null,
    }));
  }

  // ─── Import File as Document ───────────────────────────────────────────────

  async importFile(
    organizationId: string,
    userId: string,
    dto: ImportCloudFileDto,
  ): Promise<Document> {
    const conn = await this.getConnection(organizationId, dto.connectionId);

    // Resolve the web-view URL if not provided
    let fileUrl = dto.fileUrl;
    if (!fileUrl) {
      const token = await this.refreshAccessToken(conn);
      fileUrl = await this.resolveFileUrl(conn.provider, token, dto.fileId);
    }

    const document = await this.documentModel.create({
      organizationId: new Types.ObjectId(organizationId),
      createdByUserId: new Types.ObjectId(userId),
      projectId: dto.projectId ? new Types.ObjectId(dto.projectId) : undefined,
      title: dto.fileName,
      description: `Imported from ${this.providerLabel(conn.provider)}`,
      category: dto.category ?? 'Other',
      storageKey: `cloud:${conn.provider}:${dto.fileId}`,
      fileUrl,
      tags: [conn.provider.replace('_', '-'), 'imported'],
    });

    return document;
  }

  private async resolveFileUrl(
    provider: CloudProvider,
    token: string,
    fileId: string,
  ): Promise<string> {
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
    // Dropbox: get a temporary link
    const resp = await axios.post<{ link: string }>(
      'https://api.dropboxapi.com/2/files/get_temporary_link',
      { path: fileId },
      { headers: { Authorization: `Bearer ${token}` } },
    );
    return resp.data.link;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async getConnection(
    organizationId: string,
    connectionId: string,
  ): Promise<CloudStorageConnectionDocument> {
    const conn = await this.connectionModel.findOne({
      _id: connectionId,
      organizationId: new Types.ObjectId(organizationId),
      isActive: true,
    });
    if (!conn) throw new NotFoundException('Cloud storage connection not found');
    return conn;
  }

  private providerLabel(provider: CloudProvider): string {
    return { google_drive: 'Google Drive', dropbox: 'Dropbox', sharepoint: 'SharePoint' }[provider];
  }
}