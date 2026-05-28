import { IsMongoId, IsNumber, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateActivityTemplateDto {
  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(2)
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  indicatorId?: string;

  @IsOptional()
  @IsString()
  defaultLocation?: string;

  @IsOptional()
  @IsString()
  defaultActivityType?: string;

  @IsOptional()
  @IsString()
  defaultEvidenceUrl?: string;

  @IsOptional()
  @IsNumber()
  defaultParticipants?: number;

  @IsOptional()
  @IsNumber()
  defaultQuantity?: number;

  @IsOptional()
  @IsString()
  defaultNotes?: string;
}
