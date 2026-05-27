import { IsString, IsNumber, IsOptional, IsEnum, Min, Max, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ObjectiveDto {
  @IsString()
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
  current?: number;
}

class PerspectiveDto {
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
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsNumber()
  fiscalYear!: number;

  @ValidateNested({ each: true })
  @Type(() => PerspectiveDto)
  perspectives!: PerspectiveDto[];
}

export class UpdateBalancedScorecardDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

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
  title?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  current?: number;

  @IsOptional()
  @IsEnum(['on_track', 'at_risk', 'off_track'])
  status?: string;
}
