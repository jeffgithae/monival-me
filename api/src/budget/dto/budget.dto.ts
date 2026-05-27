import { IsString, IsNumber, IsOptional, IsDateString, IsMongoId, IsEnum, Min } from 'class-validator';

export class CreateBudgetAllocationDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsMongoId()
  projectId?: string;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  allocatedAmount!: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsEnum(['operational', 'project', 'emergency', 'strategic'])
  category?: string;

  @IsNumber()
  fiscalYear!: number;

  @IsDateString()
  startDate!: string;

  @IsDateString()
  endDate!: string;

  @IsOptional()
  @IsString({ each: true })
  allowedExpenseTypes?: string[];
}

export class UpdateBudgetAllocationDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  allocatedAmount?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  spentAmount?: number;

  @IsOptional()
  @IsEnum(['draft', 'approved', 'active', 'closed'])
  status?: string;

  @IsOptional()
  @IsString({ each: true })
  allowedExpenseTypes?: string[];
}

export class ApproveBudgetDto {
  @IsString()
  approverUserId!: string;

  @IsOptional()
  @IsString()
  notes?: string;
}
