import {
  IsArray, IsBoolean, IsEnum, IsIn, IsMongoId,
  IsNotEmpty, IsNumber, IsOptional, IsString, Max, Min,
} from 'class-validator';

export class CreateScheduledReportDto {
  @IsMongoId()
  projectId!: string;

  @IsOptional()
  @IsMongoId()
  reportingPeriodId?: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsArray()
  @IsString({ each: true })
  recipients!: string[];

  @IsIn(['daily', 'weekly', 'monthly', 'quarterly'])
  cadence!: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsBoolean()
  includeCsv?: boolean;
}

export class UpdateScheduledReportDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  recipients?: string[];

  @IsOptional()
  @IsIn(['daily', 'weekly', 'monthly', 'quarterly'])
  cadence?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(28)
  dayOfMonth?: number;

  @IsOptional()
  @IsBoolean()
  includeCsv?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}