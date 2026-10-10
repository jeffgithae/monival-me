import { IsString, IsNotEmpty, IsNumber, IsInt, IsArray, IsOptional, IsEnum, IsMongoId, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ObjectiveDto {
  // Objectives are saved by sending the perspective list back, so existing
  // entries arrive with the id and status the server gave them.
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsOptional()
  @IsEnum(['on_track', 'at_risk', 'off_track'])
  status?: string;

  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  @Min(0)
  @Max(100)
  weight!: number;

  @IsNumber()
  @Min(0)
  target!: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  current?: number;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  linkedOkrIds?: string[];
}

class PerspectiveDto {
  @IsOptional()
  @IsMongoId()
  _id?: string;

  @IsEnum(['financial', 'customer', 'internal', 'learning'])
  perspective!: string;

  @IsOptional()
  @IsString()
  strategicTheme?: string;

  @ValidateNested({ each: true })
  @Type(() => ObjectiveDto)
  objectives!: ObjectiveDto[];
}

export class CreateBalancedScorecardDto {
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(2000)
  @Max(2100)
  fiscalYear!: number;

  // The create form sends an explicit starting status.
  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @ValidateNested({ each: true })
  @Type(() => PerspectiveDto)
  perspectives!: PerspectiveDto[];
}

export class UpdateBalancedScorecardDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'name is required' })
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(2000)
  @Max(2100)
  fiscalYear?: number;

  @IsOptional()
  @IsEnum(['draft', 'active', 'archived'])
  status?: string;

  @IsOptional()
  @ValidateNested({ each: true })
  @Type(() => PerspectiveDto)
  perspectives?: PerspectiveDto[];
}

export class UpdateObjectiveDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty({ message: 'title is required' })
  title?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  weight?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  target?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  current?: number;

  @IsOptional()
  @IsEnum(['on_track', 'at_risk', 'off_track'])
  status?: string;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  linkedOkrIds?: string[];
}
