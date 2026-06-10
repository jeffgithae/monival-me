import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export type CloudProvider = 'google_drive' | 'dropbox' | 'sharepoint';

export class ConnectCloudStorageDto {
  @IsNotEmpty()
  @IsEnum(['google_drive', 'dropbox', 'sharepoint'])
  provider: CloudProvider;

  @IsNotEmpty()
  @IsString()
  code: string;

  @IsOptional()
  @IsString()
  codeVerifier?: string;

  @IsNotEmpty()
  @IsString()
  redirectUri: string;

  @IsOptional()
  @IsString()
  label?: string;
}