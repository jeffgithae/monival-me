import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type CloudProvider = 'google_drive' | 'dropbox' | 'sharepoint';

export class ConnectCloudStorageDto {
  @IsNotEmpty()
  @IsEnum(['google_drive', 'dropbox', 'sharepoint'])
  provider: CloudProvider;

  /** The OAuth authorization code returned after user consent */
  @IsNotEmpty()
  @IsString()
  code: string;

  /** PKCE code_verifier (required for Dropbox / some flows) */
  @IsOptional()
  @IsString()
  codeVerifier?: string;

  /** Absolute redirect_uri used in the initial authorization request */
  @IsNotEmpty()
  @IsString()
  redirectUri: string;

  /** Optional human label for this connection */
  @IsOptional()
  @IsString()
  label?: string;
}