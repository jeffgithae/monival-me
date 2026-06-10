import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ImportCloudFileDto {
  @IsNotEmpty()
  @IsString()
  connectionId: string;

  @IsNotEmpty()
  @IsString()
  fileId: string;

  @IsNotEmpty()
  @IsString()
  fileName: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;

  @IsOptional()
  @IsString()
  mimeType?: string;

  @IsOptional()
  @IsString()
  projectId?: string;

  @IsOptional()
  @IsString()
  category?: string;
}