import {
  IsString, IsOptional, IsMongoId, IsIn, IsBoolean,
  IsObject, IsNumber, MinLength, Min,
} from 'class-validator';

export class CreateIntegrationDto {
  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsOptional()
  @IsMongoId()
  templateId?: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsIn(['kobo', 'odk', 'commcare', 'ona', 'webhook', 'csv'])
  platform!: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  @IsOptional()
  @IsObject()
  config?: Record<string, unknown>;

  @IsOptional()
  @IsObject()
  fieldMapping?: Record<string, string>;

  @IsOptional()
  @IsMongoId()
  indicatorId?: string;

  @IsOptional()
  @IsMongoId()
  activityId?: string;

  @IsOptional()
  @IsNumber()
  @Min(5)
  syncIntervalMinutes?: number;
}