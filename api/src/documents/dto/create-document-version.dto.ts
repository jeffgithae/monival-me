import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateDocumentVersionDto {
  @IsOptional()
  @IsString()
  releaseNotes?: string;

  @IsOptional()
  @IsString()
  storageKey?: string;

  @IsOptional()
  @IsString()
  fileUrl?: string;
}
