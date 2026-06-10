import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ImportCloudFileDto {
  /** The connection ID (CloudStorageConnection._id) to use */
  @IsNotEmpty()
  @IsString()
  connectionId: string;

  /** Provider-native file / item identifier */
  @IsNotEmpty()
  @IsString()
  fileId: string;

  /** Human-readable name of the file (used as document title) */
  @IsNotEmpty()
  @IsString()
  fileName: string;

  /** Direct link to the file on the provider (stored as fileUrl) */
  @IsOptional()
  @IsString()
  fileUrl?: string;

  /** MIME type of the file */
  @IsOptional()
  @IsString()
  mimeType?: string;

  /** Optional project to associate the imported document with */
  @IsOptional()
  @IsString()
  projectId?: string;

  /** Optional category override */
  @IsOptional()
  @IsString()
  category?: string;
}