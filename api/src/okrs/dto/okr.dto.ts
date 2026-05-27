import { IsString, IsNumber, IsOptional, IsMongoId, IsEnum, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class KeyResultDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  targetValue!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentValue?: number;

  @IsOptional()
  @IsString()
  unit?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class CreateOKRDto {
  @IsString()
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(1)
  @Max(4)
  quarter!: number;

  @IsNumber()
  year!: number;

  @IsOptional()
  @IsMongoId()
  ownerUserId?: string;

  @ValidateNested({ each: true })
  @Type(() => KeyResultDto)
  keyResults!: KeyResultDto[];

  @IsOptional()
  @IsMongoId({ each: true })
  linkedProjects?: string[];

  @IsOptional()
  @IsEnum(['draft', 'active', 'completed', 'archived'])
  status?: string;
}

export class UpdateOKRDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(['draft', 'active', 'completed', 'archived'])
  status?: string;

  @IsOptional()
  @IsMongoId()
  ownerUserId?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => KeyResultDto)
  keyResults?: KeyResultDto[];

  @IsOptional()
  @IsMongoId({ each: true })
  linkedProjects?: string[];
}

export class UpdateKeyResultDto {
  @IsOptional()
  @IsString()
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  currentValue?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence?: number;

  @IsOptional()
  @IsEnum(['not_started', 'in_progress', 'at_risk', 'completed'])
  status?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
