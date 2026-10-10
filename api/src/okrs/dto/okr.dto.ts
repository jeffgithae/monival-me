import { IsString, IsNotEmpty, IsNumber, IsOptional, IsMongoId, IsEnum, IsArray, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class KeyResultDto {
  // Key results are saved by sending the whole list back, so entries that
  // already exist arrive with the id and status the server gave them.
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsOptional()
  @IsEnum(['not_started', 'in_progress', 'at_risk', 'completed'])
  status?: string;

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

  // Links the key result to an indicator; its current value then follows the
  // indicator's achieved figure. Null (or absent) means it is tracked by hand.
  @IsOptional()
  @IsMongoId()
  indicatorId?: string | null;
}

export class CreateOKRDto {
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
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
  @IsArray()
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
  @IsArray()
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

  // Explicit null unlinks the indicator.
  @IsOptional()
  @IsMongoId()
  indicatorId?: string | null;
}
