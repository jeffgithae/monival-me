import { IsEnum, IsNotEmpty, IsOptional, IsString, MinLength } from 'class-validator';

export type CloudProvider = 'google_drive' | 'dropbox' | 'sharepoint';

export class SaveOrgCloudCredentialsDto {
  @IsEnum(['google_drive', 'dropbox', 'sharepoint'])
  provider!: CloudProvider;

  @IsString()
  @IsNotEmpty()
  clientId!: string;

  @IsString()
  @MinLength(8)
  clientSecret!: string;

  /** Required for SharePoint (Azure Directory/Tenant ID) */
  @IsOptional()
  @IsString()
  tenantId?: string;

  @IsOptional()
  @IsString()
  label?: string;
}