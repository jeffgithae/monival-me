import { IsDateString, IsIn, IsMongoId, IsNumber, IsObject, IsOptional, IsString, MinLength } from 'class-validator';

export class CreateReportingPeriodDto {
  @IsMongoId()
  projectId!: string;

  @IsString()
  @MinLength(3)
  name!: string;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'semiannual', 'annual', 'custom'])
  cadence?: string;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpsertIndicatorResultDto {
  @IsMongoId()
  reportingPeriodId!: string;

  @IsMongoId()
  indicatorId!: string;

  @IsNumber()
  achieved!: number;

  @IsOptional()
  @IsString()
  narrative?: string;

  @IsOptional()
  @IsObject()
  disaggregations?: Record<string, unknown>;
}

export class UpsertIndicatorTargetDto {
  @IsMongoId()
  reportingPeriodId!: string;

  @IsMongoId()
  indicatorId!: string;

  @IsNumber()
  target!: number;

  @IsOptional()
  @IsNumber()
  baseline?: number;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class ReviewReportingPeriodDto {
  @IsIn(['open', 'submitted', 'approved', 'locked'])
  status!: 'open' | 'submitted' | 'approved' | 'locked';

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateReportingPeriodDto {
  @IsOptional()
  @IsString()
  @MinLength(3)
  name?: string;

  @IsOptional()
  @IsIn(['monthly', 'quarterly', 'semiannual', 'annual', 'custom'])
  cadence?: string;

  @IsOptional()
  @IsDateString()
  startDate?: string;

  @IsOptional()
  @IsDateString()
  endDate?: string;

  @IsOptional()
  @IsDateString()
  dueDate?: string;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class UpdateNarrativeDto {
  @IsOptional()
  @IsString()
  narrative?: string;

  @IsOptional()
  @IsString()
  challenges?: string;

  @IsOptional()
  @IsString()
  lessonsLearned?: string;

  @IsOptional()
  @IsString()
  nextPeriodPlans?: string;
}