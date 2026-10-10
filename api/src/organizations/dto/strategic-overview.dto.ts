import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsNotEmpty, IsOptional, IsString, MaxLength, ValidateNested } from 'class-validator';

export class StrategicPillarDto {
  @IsString()
  @IsNotEmpty({ message: 'pillar name is required' })
  @MaxLength(120)
  pillar!: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  description?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @IsString({ each: true })
  @MaxLength(160, { each: true })
  initiatives?: string[];
}

export class UpdateStrategicOverviewDto {
  @IsOptional()
  @IsString()
  @MaxLength(600)
  vision?: string;

  @IsOptional()
  @IsString()
  @MaxLength(600)
  mission?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => StrategicPillarDto)
  strategicPillars?: StrategicPillarDto[];
}
